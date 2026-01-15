import { useState, useEffect, useCallback, useRef } from 'react'
import { signaling } from '../lib/signaling'

interface PeerConnection {
  peerId: string
  connection: RTCPeerConnection
  stream: MediaStream | null
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: []  // Empty for local network - host candidates only
}

export function useWebRTC(localStream: MediaStream | null) {
  const [peers, setPeers] = useState<Map<string, PeerConnection>>(new Map())
  const peersRef = useRef<Map<string, PeerConnection>>(new Map())
  const localStreamRef = useRef<MediaStream | null>(localStream)

  // Update ref when stream changes and add tracks to existing connections
  useEffect(() => {
    localStreamRef.current = localStream
    if (localStream) {
      console.log('[WebRTC] Local stream available, adding tracks to existing peers')
      peersRef.current.forEach((peer, peerId) => {
        const senders = peer.connection.getSenders()
        if (senders.length === 0) {
          console.log(`[WebRTC] Adding tracks to existing connection ${peerId}`)
          localStream.getTracks().forEach(track => {
            peer.connection.addTrack(track, localStream)
          })
        }
      })
    }
  }, [localStream])

  const updatePeers = useCallback(() => {
    setPeers(new Map(peersRef.current))
  }, [])

  const createPeerConnection = useCallback((peerId: string): RTCPeerConnection => {
    console.log(`[WebRTC] Creating connection for ${peerId}`)

    const pc = new RTCPeerConnection(ICE_SERVERS)

    // Add local tracks if available
    const stream = localStreamRef.current
    if (stream) {
      stream.getTracks().forEach(track => {
        console.log(`[WebRTC] Adding local ${track.kind} track`)
        pc.addTrack(track, stream)
      })
    } else {
      console.log(`[WebRTC] No local stream yet, tracks will be added later`)
    }

    // Handle remote tracks
    pc.ontrack = (event) => {
      console.log(`[WebRTC] Got remote ${event.track.kind} track from ${peerId}`)
      const peer = peersRef.current.get(peerId)
      if (peer && event.streams[0]) {
        peer.stream = event.streams[0]
        peersRef.current.set(peerId, { ...peer })
        updatePeers()
      }
    }

    // Send ICE candidates
    pc.onicecandidate = (event) => {
      console.log(`[WebRTC] ICE candidate event for ${peerId}:`, event.candidate ? 'got candidate' : 'gathering complete')
      if (event.candidate) {
        console.log(`[WebRTC] Sending ICE candidate to ${peerId}`)
        signaling.sendIceCandidate(peerId, event.candidate.toJSON())
      }
    }

    pc.onicegatheringstatechange = () => {
      console.log(`[WebRTC] ICE gathering state: ${pc.iceGatheringState}`)
    }

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE state with ${peerId}: ${pc.iceConnectionState}`)
    }

    const peerConn: PeerConnection = { peerId, connection: pc, stream: null }
    peersRef.current.set(peerId, peerConn)
    updatePeers()

    return pc
  }, [updatePeers])

  // Initiate connection (caller)
  const initiateConnection = useCallback(async (peerId: string) => {
    // Prevent duplicate connections
    if (peersRef.current.has(peerId)) {
      console.log(`[WebRTC] Already have connection to ${peerId}, skipping`)
      return
    }

    console.log(`[WebRTC] Initiating to ${peerId}`)
    const pc = createPeerConnection(peerId)

    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // Wait for ICE gathering (with timeout)
      if (pc.iceGatheringState !== 'complete') {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            console.log(`[WebRTC] ICE gathering timeout, sending anyway`)
            resolve()
          }, 3000)

          const checkState = () => {
            console.log(`[WebRTC] ICE gathering state changed: ${pc.iceGatheringState}`)
            if (pc.iceGatheringState === 'complete') {
              clearTimeout(timeout)
              pc.removeEventListener('icegatheringstatechange', checkState)
              resolve()
            }
          }
          pc.addEventListener('icegatheringstatechange', checkState)
          if (pc.iceGatheringState === 'complete') {
            clearTimeout(timeout)
            resolve()
          }
        })
      }

      console.log(`[WebRTC] Sending offer, state: ${pc.iceGatheringState}`)
      signaling.sendOffer(peerId, pc.localDescription!)
    } catch (err) {
      console.error('[WebRTC] Offer error:', err)
    }
  }, [createPeerConnection])

  // Handle incoming offer (callee)
  const handleOffer = useCallback(async (from: string, offer: RTCSessionDescriptionInit) => {
    console.log(`[WebRTC] Got offer from ${from}`)

    let pc = peersRef.current.get(from)?.connection
    if (!pc) {
      pc = createPeerConnection(from)
    }

    // Skip if we're not in a state to accept an offer
    if (pc.signalingState !== 'stable' && pc.signalingState !== 'have-local-offer') {
      console.log(`[WebRTC] Ignoring offer, wrong state: ${pc.signalingState}`)
      return
    }

    try {
      await pc.setRemoteDescription(offer)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      // Wait for ICE gathering (with timeout)
      if (pc.iceGatheringState !== 'complete') {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            console.log(`[WebRTC] ICE gathering timeout, sending anyway`)
            resolve()
          }, 3000)

          const checkState = () => {
            console.log(`[WebRTC] ICE gathering state changed: ${pc.iceGatheringState}`)
            if (pc.iceGatheringState === 'complete') {
              clearTimeout(timeout)
              pc.removeEventListener('icegatheringstatechange', checkState)
              resolve()
            }
          }
          pc.addEventListener('icegatheringstatechange', checkState)
          if (pc.iceGatheringState === 'complete') {
            clearTimeout(timeout)
            resolve()
          }
        })
      }

      console.log(`[WebRTC] Sending answer, state: ${pc.iceGatheringState}`)
      signaling.sendAnswer(from, pc.localDescription!)
    } catch (err) {
      console.error('[WebRTC] Answer error:', err)
    }
  }, [createPeerConnection])

  // Handle incoming answer
  const handleAnswer = useCallback(async (from: string, answer: RTCSessionDescriptionInit) => {
    console.log(`[WebRTC] Got answer from ${from}`)
    const pc = peersRef.current.get(from)?.connection
    if (pc) {
      try {
        await pc.setRemoteDescription(answer)
      } catch (err) {
        console.error('[WebRTC] Set answer error:', err)
      }
    }
  }, [])

  // Handle ICE candidate
  const handleIceCandidate = useCallback(async (from: string, candidate: RTCIceCandidateInit) => {
    const pc = peersRef.current.get(from)?.connection
    if (pc) {
      try {
        await pc.addIceCandidate(candidate)
      } catch (err) {
        // Ignore errors for candidates that arrive before remote description
      }
    }
  }, [])

  const removePeer = useCallback((peerId: string) => {
    const peer = peersRef.current.get(peerId)
    if (peer) {
      peer.connection.close()
      peersRef.current.delete(peerId)
      updatePeers()
    }
  }, [updatePeers])

  const closeAllConnections = useCallback(() => {
    peersRef.current.forEach(p => p.connection.close())
    peersRef.current.clear()
    updatePeers()
  }, [updatePeers])

  // Set up signaling listeners
  useEffect(() => {
    const onOffer = (data: { from: string; offer: RTCSessionDescriptionInit }) => {
      handleOffer(data.from, data.offer)
    }
    const onAnswer = (data: { from: string; answer: RTCSessionDescriptionInit }) => {
      handleAnswer(data.from, data.answer)
    }
    const onIce = (data: { from: string; candidate: RTCIceCandidateInit }) => {
      handleIceCandidate(data.from, data.candidate)
    }
    const onLeft = (data: { id: string }) => {
      removePeer(data.id)
    }

    signaling.on('offer', onOffer as (...args: unknown[]) => void)
    signaling.on('answer', onAnswer as (...args: unknown[]) => void)
    signaling.on('ice-candidate', onIce as (...args: unknown[]) => void)
    signaling.on('player-left', onLeft as (...args: unknown[]) => void)

    return () => {
      signaling.off('offer', onOffer as (...args: unknown[]) => void)
      signaling.off('answer', onAnswer as (...args: unknown[]) => void)
      signaling.off('ice-candidate', onIce as (...args: unknown[]) => void)
      signaling.off('player-left', onLeft as (...args: unknown[]) => void)
    }
  }, [handleOffer, handleAnswer, handleIceCandidate, removePeer])

  return {
    peers,
    initiateConnection,
    removePeer,
    closeAllConnections
  }
}
