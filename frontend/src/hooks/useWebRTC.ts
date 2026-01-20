import { useState, useEffect, useCallback, useRef } from 'react'
import { signaling } from '../lib/signaling'

interface PeerConnection {
  peerId: string
  connection: RTCPeerConnection
  stream: MediaStream | null
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // Free TURN servers from Open Relay Project
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
  ]
}

export function useWebRTC(localStream: MediaStream | null) {
  const [peers, setPeers] = useState<Map<string, PeerConnection>>(new Map())
  const peersRef = useRef<Map<string, PeerConnection>>(new Map())
  const localStreamRef = useRef<MediaStream | null>(localStream)
  // Queue ICE candidates that arrive before remote description is set
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map())

  // Update ref when stream changes and add tracks to existing connections
  useEffect(() => {
    localStreamRef.current = localStream
    if (localStream) {
      console.log('[WebRTC] Local stream available, adding tracks to existing peers')
      peersRef.current.forEach(async (peer, peerId) => {
        const pc = peer.connection
        const senders = pc.getSenders()

        // Check if we need to add tracks
        const videoSender = senders.find(s => s.track?.kind === 'video')
        const audioSender = senders.find(s => s.track?.kind === 'audio')
        const videoTrack = localStream.getVideoTracks()[0]
        const audioTrack = localStream.getAudioTracks()[0]

        let needsRenegotiation = false

        // Replace or add video track
        if (videoTrack) {
          if (videoSender) {
            if (videoSender.track !== videoTrack) {
              console.log(`[WebRTC] Replacing video track for ${peerId}`)
              await videoSender.replaceTrack(videoTrack)
            }
          } else {
            console.log(`[WebRTC] Adding video track for ${peerId}`)
            pc.addTrack(videoTrack, localStream)
            needsRenegotiation = true
          }
        }

        // Replace or add audio track
        if (audioTrack) {
          if (audioSender) {
            if (audioSender.track !== audioTrack) {
              console.log(`[WebRTC] Replacing audio track for ${peerId}`)
              await audioSender.replaceTrack(audioTrack)
            }
          } else {
            console.log(`[WebRTC] Adding audio track for ${peerId}`)
            pc.addTrack(audioTrack, localStream)
            needsRenegotiation = true
          }
        }

        // Renegotiate if we added new tracks and connection is stable
        if (needsRenegotiation && pc.signalingState === 'stable') {
          console.log(`[WebRTC] Renegotiating with ${peerId} after adding tracks`)
          try {
            const offer = await pc.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true
            })
            await pc.setLocalDescription(offer)
            signaling.sendOffer(peerId, pc.localDescription!)
          } catch (err) {
            console.error(`[WebRTC] Renegotiation error with ${peerId}:`, err)
          }
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
        const sender = pc.addTrack(track, stream)

        // Set high bitrate for video to preserve quality for card scanning
        if (track.kind === 'video' && sender) {
          const params = sender.getParameters()
          if (!params.encodings) {
            params.encodings = [{}]
          }
          // Set high bitrate (4 Mbps) for better video quality
          params.encodings[0].maxBitrate = 4000000
          sender.setParameters(params).catch(err => {
            console.warn('[WebRTC] Failed to set video bitrate:', err)
          })
        }
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

    // Send ICE candidates (trickle ICE)
    pc.onicecandidate = (event) => {
      console.log(`[WebRTC] onicecandidate fired for ${peerId}:`, event.candidate ? 'has candidate' : 'null (gathering done)')
      if (event.candidate) {
        try {
          console.log(`[WebRTC] Sending ICE candidate to ${peerId}: ${event.candidate.candidate.slice(0, 60)}...`)
          signaling.sendIceCandidate(peerId, event.candidate.toJSON())
        } catch (err) {
          console.error(`[WebRTC] Error sending ICE candidate:`, err)
        }
      } else {
        console.log(`[WebRTC] ICE gathering complete for ${peerId}`)
      }
    }

    pc.onicegatheringstatechange = () => {
      console.log(`[WebRTC] ICE gathering state changed for ${peerId}: ${pc.iceGatheringState}`)
    }

    // Log initial state
    console.log(`[WebRTC] Initial ICE gathering state for ${peerId}: ${pc.iceGatheringState}`)

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE connection state with ${peerId}: ${pc.iceConnectionState}`)
      // Don't auto-restart on disconnect - the connection is unstable and constant restarts make it worse
      // Just log for now
    }

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state with ${peerId}: ${pc.connectionState}`)
      // If connection failed, remove peer so it can be retried
      if (pc.connectionState === 'failed') {
        console.log(`[WebRTC] Connection failed with ${peerId}, removing peer for retry`)
        peersRef.current.delete(peerId)
        pendingCandidatesRef.current.delete(peerId)
        updatePeers()
      }
    }

    // Note: We don't use onnegotiationneeded because it fires at unpredictable times
    // and causes state conflicts. ICE restart is handled explicitly in oniceconnectionstatechange.

    const peerConn: PeerConnection = { peerId, connection: pc, stream: null }
    peersRef.current.set(peerId, peerConn)
    updatePeers()

    return pc
  }, [updatePeers])

  // Apply any queued ICE candidates
  const applyPendingCandidates = useCallback(async (peerId: string, pc: RTCPeerConnection) => {
    const pending = pendingCandidatesRef.current.get(peerId)
    if (pending && pending.length > 0) {
      console.log(`[WebRTC] Applying ${pending.length} queued ICE candidates for ${peerId}`)
      for (const candidate of pending) {
        try {
          await pc.addIceCandidate(candidate)
        } catch (err) {
          console.warn(`[WebRTC] Failed to add queued candidate:`, err)
        }
      }
      pendingCandidatesRef.current.delete(peerId)
    }
  }, [])

  // Initiate connection (caller) - sends offer immediately, candidates trickle
  const initiateConnection = useCallback(async (peerId: string) => {
    // Prevent duplicate connections
    if (peersRef.current.has(peerId)) {
      console.log(`[WebRTC] Already have connection to ${peerId}, skipping`)
      return
    }

    console.log(`[WebRTC] Initiating connection to ${peerId}`)
    const pc = createPeerConnection(peerId)

    try {
      // Always indicate we want to receive audio/video even if we don't have local tracks yet
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      })
      await pc.setLocalDescription(offer)
      console.log(`[WebRTC] Set local description (offer) for ${peerId}, gathering state: ${pc.iceGatheringState}`)

      // Send offer immediately - ICE candidates will trickle via onicecandidate
      console.log(`[WebRTC] Sending offer to ${peerId}`)
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

    // Handle glare (both sides sent offer) - lower ID wins
    if (pc.signalingState === 'have-local-offer') {
      const myId = signaling.id || ''
      if (myId < from) {
        console.log(`[WebRTC] Glare detected with ${from}, I win (lower ID), ignoring their offer`)
        return
      } else {
        console.log(`[WebRTC] Glare detected with ${from}, they win (lower ID), rolling back`)
        await pc.setLocalDescription({ type: 'rollback' })
      }
    }

    try {
      await pc.setRemoteDescription(offer)
      console.log(`[WebRTC] Set remote description for ${from}, gathering state: ${pc.iceGatheringState}`)

      // Apply any pending ICE candidates now that we have remote description
      await applyPendingCandidates(from, pc)

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      console.log(`[WebRTC] Set local description (answer) for ${from}, gathering state: ${pc.iceGatheringState}`)

      // Send answer immediately - ICE candidates will trickle via onicecandidate
      console.log(`[WebRTC] Sending answer to ${from}`)
      signaling.sendAnswer(from, pc.localDescription!)
    } catch (err) {
      console.error('[WebRTC] Answer error:', err)
    }
  }, [createPeerConnection, applyPendingCandidates])

  // Handle incoming answer
  const handleAnswer = useCallback(async (from: string, answer: RTCSessionDescriptionInit) => {
    console.log(`[WebRTC] Got answer from ${from}`)
    const pc = peersRef.current.get(from)?.connection
    if (pc) {
      try {
        await pc.setRemoteDescription(answer)
        // Apply any pending ICE candidates now that we have remote description
        await applyPendingCandidates(from, pc)
      } catch (err) {
        console.error('[WebRTC] Set answer error:', err)
      }
    }
  }, [applyPendingCandidates])

  // Handle ICE candidate - queue if no remote description yet
  const handleIceCandidate = useCallback(async (from: string, candidate: RTCIceCandidateInit) => {
    console.log(`[WebRTC] Got ICE candidate from ${from}`)
    const pc = peersRef.current.get(from)?.connection

    if (!pc) {
      // Queue candidate - peer connection doesn't exist yet
      console.log(`[WebRTC] Queueing ICE candidate for ${from} (no connection yet)`)
      if (!pendingCandidatesRef.current.has(from)) {
        pendingCandidatesRef.current.set(from, [])
      }
      pendingCandidatesRef.current.get(from)!.push(candidate)
      return
    }

    if (!pc.remoteDescription) {
      // Queue candidate - remote description not set yet
      console.log(`[WebRTC] Queueing ICE candidate for ${from} (no remote description)`)
      if (!pendingCandidatesRef.current.has(from)) {
        pendingCandidatesRef.current.set(from, [])
      }
      pendingCandidatesRef.current.get(from)!.push(candidate)
      return
    }

    try {
      await pc.addIceCandidate(candidate)
      console.log(`[WebRTC] Added ICE candidate from ${from}`)
    } catch (err) {
      console.warn(`[WebRTC] Failed to add ICE candidate from ${from}:`, err)
    }
  }, [])

  const removePeer = useCallback((peerId: string) => {
    const peer = peersRef.current.get(peerId)
    if (peer) {
      peer.connection.close()
      peersRef.current.delete(peerId)
      pendingCandidatesRef.current.delete(peerId)
      updatePeers()
    }
  }, [updatePeers])

  const closeAllConnections = useCallback(() => {
    peersRef.current.forEach(p => p.connection.close())
    peersRef.current.clear()
    pendingCandidatesRef.current.clear()
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
