import { useState, useEffect, useCallback, useRef } from 'react'

export interface CameraDevice {
  deviceId: string
  label: string
}

export interface CameraSettings {
  width: number
  height: number
  frameRate: number
}

const DEFAULT_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30 }
  },
  audio: true
}

export function useCamera() {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [devices, setDevices] = useState<CameraDevice[]>([])
  const [currentDevice, setCurrentDevice] = useState<string | null>(null)
  const [settings, setSettings] = useState<CameraSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [videoEnabled, setVideoEnabled] = useState(true)
  const streamRef = useRef<MediaStream | null>(null)

  const getDevices = useCallback(async () => {
    try {
      const deviceList = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = deviceList
        .filter(device => device.kind === 'videoinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${device.deviceId.slice(0, 8)}`
        }))
      setDevices(videoDevices)
      return videoDevices
    } catch (err) {
      console.error('Failed to enumerate devices:', err)
      return []
    }
  }, [])

  const startCamera = useCallback(async (deviceId?: string) => {
    setIsLoading(true)
    setError(null)

    try {
      // Stop existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }

      const constraints: MediaStreamConstraints = {
        ...DEFAULT_CONSTRAINTS,
        video: {
          ...(DEFAULT_CONSTRAINTS.video as MediaTrackConstraints),
          ...(deviceId && { deviceId: { exact: deviceId } })
        }
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = mediaStream
      setStream(mediaStream)

      // Get actual settings
      const videoTrack = mediaStream.getVideoTracks()[0]
      if (videoTrack) {
        const trackSettings = videoTrack.getSettings()
        setSettings({
          width: trackSettings.width || 0,
          height: trackSettings.height || 0,
          frameRate: trackSettings.frameRate || 0
        })
        setCurrentDevice(trackSettings.deviceId || null)
      }

      // Refresh device list (labels become available after permission)
      await getDevices()

      return mediaStream
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to access camera'
      setError(message)
      console.error('Camera error:', err)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [getDevices])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
      setStream(null)
      setSettings(null)
    }
  }, [])

  const switchCamera = useCallback(async (deviceId: string) => {
    return startCamera(deviceId)
  }, [startCamera])

  const toggleAudio = useCallback(() => {
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setAudioEnabled(audioTrack.enabled)
      }
    }
  }, [])

  const toggleVideo = useCallback(() => {
    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
        setVideoEnabled(videoTrack.enabled)
      }
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  return {
    stream,
    devices,
    currentDevice,
    settings,
    error,
    isLoading,
    audioEnabled,
    videoEnabled,
    startCamera,
    stopCamera,
    switchCamera,
    toggleAudio,
    toggleVideo,
    getDevices
  }
}
