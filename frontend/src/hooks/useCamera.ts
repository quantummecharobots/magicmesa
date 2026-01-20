import { useState, useEffect, useCallback, useRef } from 'react'

export interface CameraDevice {
  deviceId: string
  label: string
}

export interface AudioDevice {
  deviceId: string
  label: string
}

export interface CameraSettings {
  width: number
  height: number
  frameRate: number
}

export interface Resolution {
  label: string
  width: number
  height: number
}

export const RESOLUTIONS: Resolution[] = [
  { label: '4K (2160p)', width: 3840, height: 2160 },
  { label: '1080p', width: 1920, height: 1080 },
  { label: '720p', width: 1280, height: 720 },
  { label: '480p', width: 854, height: 480 }
]

const DEFAULT_RESOLUTION = RESOLUTIONS[0] // 4K

const CAMERA_MIRRORED_KEY = 'magicmesa_camera_mirrored'
const CAMERA_FLIPPED_KEY = 'magicmesa_camera_flipped'

export function useCamera() {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [devices, setDevices] = useState<CameraDevice[]>([])
  const [audioInputDevices, setAudioInputDevices] = useState<AudioDevice[]>([])
  const [audioOutputDevices, setAudioOutputDevices] = useState<AudioDevice[]>([])
  const [currentDevice, setCurrentDevice] = useState<string | null>(null)
  const [currentAudioInput, setCurrentAudioInput] = useState<string | null>(null)
  const [currentAudioOutput, setCurrentAudioOutput] = useState<string | null>(null)
  const [currentResolution, setCurrentResolution] = useState<Resolution>(DEFAULT_RESOLUTION)
  const [settings, setSettings] = useState<CameraSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [videoEnabled, setVideoEnabled] = useState(true)
  const [mirrored, setMirrored] = useState(() => {
    const saved = localStorage.getItem(CAMERA_MIRRORED_KEY)
    return saved !== null ? saved === 'true' : true // Default mirror on
  })
  const [flipped, setFlipped] = useState(() => {
    const saved = localStorage.getItem(CAMERA_FLIPPED_KEY)
    return saved === 'true' // Default off
  })
  // Focus control state
  const [focusCapabilities, setFocusCapabilities] = useState<{
    supported: boolean
    min: number
    max: number
    step: number
  } | null>(null)
  const [focusDistance, setFocusDistanceState] = useState<number | null>(null)
  const [focusMode, setFocusModeState] = useState<string>('continuous')

  const streamRef = useRef<MediaStream | null>(null)
  const resolutionRef = useRef<Resolution>(DEFAULT_RESOLUTION)
  const audioInputRef = useRef<string | null>(null)

  const getDevices = useCallback(async () => {
    try {
      const deviceList = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = deviceList
        .filter(device => device.kind === 'videoinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${device.deviceId.slice(0, 8)}`
        }))
      const audioInputs = deviceList
        .filter(device => device.kind === 'audioinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${device.deviceId.slice(0, 8)}`
        }))
      const audioOutputs = deviceList
        .filter(device => device.kind === 'audiooutput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Speaker ${device.deviceId.slice(0, 8)}`
        }))
      setDevices(videoDevices)
      setAudioInputDevices(audioInputs)
      setAudioOutputDevices(audioOutputs)
      return videoDevices
    } catch (err) {
      console.error('Failed to enumerate devices:', err)
      return []
    }
  }, [])

  const startCamera = useCallback(async (deviceId?: string, resolution?: Resolution, audioDeviceId?: string) => {
    setIsLoading(true)
    setError(null)

    // Use provided resolution or current resolution
    const res = resolution || resolutionRef.current
    // Use provided audio device or current one
    const audioId = audioDeviceId || audioInputRef.current

    try {
      // Stop existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }

      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: res.width },
          height: { ideal: res.height },
          frameRate: { ideal: 30 },
          ...(deviceId && { deviceId: { exact: deviceId } })
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(audioId && { deviceId: { exact: audioId } })
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

        // Check for focus capabilities
        try {
          const capabilities = videoTrack.getCapabilities() as MediaTrackCapabilities & {
            focusMode?: string[]
            focusDistance?: { min: number; max: number; step: number }
          }
          console.log('[Camera] Track capabilities:', capabilities)

          if (capabilities.focusDistance) {
            setFocusCapabilities({
              supported: true,
              min: capabilities.focusDistance.min,
              max: capabilities.focusDistance.max,
              step: capabilities.focusDistance.step || 0.01
            })
            // Get current focus distance
            const currentSettings = trackSettings as MediaTrackSettings & { focusDistance?: number; focusMode?: string }
            if (currentSettings.focusDistance !== undefined) {
              setFocusDistanceState(currentSettings.focusDistance)
            }
            if (currentSettings.focusMode) {
              setFocusModeState(currentSettings.focusMode)
            }
          } else {
            setFocusCapabilities({ supported: false, min: 0, max: 0, step: 0 })
          }
        } catch (e) {
          console.log('[Camera] Focus capabilities not available:', e)
          setFocusCapabilities({ supported: false, min: 0, max: 0, step: 0 })
        }
      }

      // Get audio input device
      const audioTrack = mediaStream.getAudioTracks()[0]
      if (audioTrack) {
        const audioSettings = audioTrack.getSettings()
        setCurrentAudioInput(audioSettings.deviceId || null)
        audioInputRef.current = audioSettings.deviceId || null
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

  const changeResolution = useCallback(async (resolution: Resolution) => {
    resolutionRef.current = resolution
    setCurrentResolution(resolution)
    return startCamera(currentDevice || undefined, resolution)
  }, [startCamera, currentDevice])

  const switchMicrophone = useCallback(async (deviceId: string) => {
    audioInputRef.current = deviceId
    return startCamera(currentDevice || undefined, undefined, deviceId)
  }, [startCamera, currentDevice])

  const setAudioOutput = useCallback((deviceId: string) => {
    setCurrentAudioOutput(deviceId)
    // Note: Setting audio output on video elements must be done in the component
    // using the setSinkId() method on the HTMLMediaElement
    return deviceId
  }, [])

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

  const toggleMirror = useCallback(() => {
    setMirrored(prev => {
      const newValue = !prev
      localStorage.setItem(CAMERA_MIRRORED_KEY, String(newValue))
      return newValue
    })
  }, [])

  const toggleFlip = useCallback(() => {
    setFlipped(prev => {
      const newValue = !prev
      localStorage.setItem(CAMERA_FLIPPED_KEY, String(newValue))
      return newValue
    })
  }, [])

  // Set focus mode (manual or continuous)
  const setFocusMode = useCallback(async (mode: 'manual' | 'continuous') => {
    if (!streamRef.current) return false

    const videoTrack = streamRef.current.getVideoTracks()[0]
    if (!videoTrack) return false

    try {
      await videoTrack.applyConstraints({
        // @ts-expect-error - focusMode is not in the standard types yet
        focusMode: mode
      })
      setFocusModeState(mode)
      console.log('[Camera] Focus mode set to:', mode)
      return true
    } catch (e) {
      console.error('[Camera] Failed to set focus mode:', e)
      return false
    }
  }, [])

  // Set manual focus distance (0 = closest, 1 = infinity, or camera-specific range)
  const setFocusDistance = useCallback(async (distance: number) => {
    if (!streamRef.current) return false

    const videoTrack = streamRef.current.getVideoTracks()[0]
    if (!videoTrack) return false

    try {
      // First ensure we're in manual focus mode
      await videoTrack.applyConstraints({
        // @ts-expect-error - focusMode/focusDistance not in standard types yet
        focusMode: 'manual',
        focusDistance: distance
      })
      setFocusModeState('manual')
      setFocusDistanceState(distance)
      console.log('[Camera] Focus distance set to:', distance)
      return true
    } catch (e) {
      console.error('[Camera] Failed to set focus distance:', e)
      return false
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
    audioInputDevices,
    audioOutputDevices,
    currentDevice,
    currentAudioInput,
    currentAudioOutput,
    currentResolution,
    settings,
    error,
    isLoading,
    audioEnabled,
    videoEnabled,
    mirrored,
    flipped,
    focusCapabilities,
    focusDistance,
    focusMode,
    startCamera,
    stopCamera,
    switchCamera,
    switchMicrophone,
    setAudioOutput,
    changeResolution,
    toggleAudio,
    toggleVideo,
    toggleMirror,
    toggleFlip,
    setFocusMode,
    setFocusDistance,
    getDevices
  }
}
