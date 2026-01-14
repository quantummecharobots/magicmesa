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
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
}

export function useWebRTC(localStream: MediaStream | null) {
  const [peers, setPeers] = useState<Map<string, PeerConnection>>(new Map())
  const peersRef = useRef<Map<string, PeerConnection>>(new Map())

  const createPeerConnection = useCallback((peerId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection(ICE_SERVERS)

    // Add local tracks
    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream)
      })
    }

    // Handle incoming tracks
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams
      const existing = peersRef.current.get(peerId)
      if (existing) {
        existing.stream = remoteStream
        peersRef.current.set(peerId, existing)
        setPeers(new Map(peersRef.current))
      }
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        signaling.sendIceCandidate(peerId, event.candidate.toJSON())
      }
    }

    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${peerId}:`, pc.connectionState)
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        removePeer(peerId)
      }
    }

    const peerConnection: PeerConnection = {
      peerId,
      connection: pc,
      stream: null
    }

    peersRef.current.set(peerId, peerConnection)
    setPeers(new Map(peersRef.current))

    return pc
  }, [localStream])

  const initiateConnection = useCallback(async (peerId: string) => {
    const pc = createPeerConnection(peerId)

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    signaling.sendOffer(peerId, offer)
  }, [createPeerConnection])

  const handleOffer = useCallback(async (from: string, offer: RTCSessionDescriptionInit) => {
    let pc = peersRef.current.get(from)?.connection

    if (!pc) {
      pc = createPeerConnection(from)
    }

    await pc.setRemoteDescription(new RTCSessionDescription(offer))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    signaling.sendAnswer(from, answer)
  }, [createPeerConnection])

  const handleAnswer = useCallback(async (from: string, answer: RTCSessionDescriptionInit) => {
    const pc = peersRef.current.get(from)?.connection
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer))
    }
  }, [])

  const handleIceCandidate = useCallback(async (from: string, candidate: RTCIceCandidateInit) => {
    const pc = peersRef.current.get(from)?.connection
    if (pc) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate))
    }
  }, [])

  const removePeer = useCallback((peerId: string) => {
    const peer = peersRef.current.get(peerId)
    if (peer) {
      peer.connection.close()
      peersRef.current.delete(peerId)
      setPeers(new Map(peersRef.current))
    }
  }, [])

  const closeAllConnections = useCallback(() => {
    peersRef.current.forEach(peer => {
      peer.connection.close()
    })
    peersRef.current.clear()
    setPeers(new Map())
  }, [])

  useEffect(() => {
    const onOffer = (data: { from: string; offer: RTCSessionDescriptionInit }) => {
      handleOffer(data.from, data.offer)
    }

    const onAnswer = (data: { from: string; answer: RTCSessionDescriptionInit }) => {
      handleAnswer(data.from, data.answer)
    }

    const onIceCandidate = (data: { from: string; candidate: RTCIceCandidateInit }) => {
      handleIceCandidate(data.from, data.candidate)
    }

    const onPlayerLeft = (data: { id: string }) => {
      removePeer(data.id)
    }

    signaling.on('offer', onOffer as (...args: unknown[]) => void)
    signaling.on('answer', onAnswer as (...args: unknown[]) => void)
    signaling.on('ice-candidate', onIceCandidate as (...args: unknown[]) => void)
    signaling.on('player-left', onPlayerLeft as (...args: unknown[]) => void)

    return () => {
      signaling.off('offer', onOffer as (...args: unknown[]) => void)
      signaling.off('answer', onAnswer as (...args: unknown[]) => void)
      signaling.off('ice-candidate', onIceCandidate as (...args: unknown[]) => void)
      signaling.off('player-left', onPlayerLeft as (...args: unknown[]) => void)
    }
  }, [handleOffer, handleAnswer, handleIceCandidate, removePeer])

  // Update tracks when local stream changes
  useEffect(() => {
    if (localStream) {
      peersRef.current.forEach(peer => {
        const senders = peer.connection.getSenders()
        localStream.getTracks().forEach(track => {
          const sender = senders.find(s => s.track?.kind === track.kind)
          if (sender) {
            sender.replaceTrack(track)
          } else {
            peer.connection.addTrack(track, localStream)
          }
        })
      })
    }
  }, [localStream])

  return {
    peers,
    initiateConnection,
    removePeer,
    closeAllConnections
  }
}
