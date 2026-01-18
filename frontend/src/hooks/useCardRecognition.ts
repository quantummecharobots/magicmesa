import { useState, useCallback, useRef } from 'react'

// Use same origin as frontend - Vite proxy routes /api to backend
const API_URL = import.meta.env.VITE_API_URL || window.location.origin

interface RecognitionResult {
  cardName: string | null
}

export function useCardRecognition() {
  const [isProcessing, setIsProcessing] = useState(false)
  // Use ref to prevent stale closure issues with the processing check
  const isProcessingRef = useRef(false)

  // Capture a frame from the video element (full frame for Claude Vision)
  const captureFrame = useCallback((videoElement: HTMLVideoElement): string | null => {
    console.log('[CardRecognition] captureFrame called, readyState:', videoElement?.readyState, 'videoWidth:', videoElement?.videoWidth, 'videoHeight:', videoElement?.videoHeight)

    if (!videoElement) {
      console.log('[CardRecognition] No video element')
      return null
    }

    if (videoElement.readyState < 2) {
      console.log('[CardRecognition] Video not ready, readyState:', videoElement.readyState)
      return null
    }

    if (!videoElement.videoWidth || !videoElement.videoHeight) {
      console.log('[CardRecognition] Video dimensions are 0')
      return null
    }

    const canvas = document.createElement('canvas')
    canvas.width = videoElement.videoWidth
    canvas.height = videoElement.videoHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      console.log('[CardRecognition] Could not get canvas context')
      return null
    }

    ctx.drawImage(videoElement, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
    console.log('[CardRecognition] Frame captured, size:', dataUrl.length)
    return dataUrl
  }, [])

  // Send image to backend for Claude Vision recognition
  const recognizeCard = useCallback(async (imageData: string): Promise<RecognitionResult | null> => {
    // Use ref to check current processing state (avoids stale closure)
    if (isProcessingRef.current) {
      console.log('[CardRecognition] Already processing, skipping')
      return null
    }

    isProcessingRef.current = true
    setIsProcessing(true)
    console.log('[CardRecognition] Starting recognition, API URL:', API_URL)

    try {
      const response = await fetch(`${API_URL}/api/recognize-card`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ image: imageData })
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`API error: ${response.status} - ${text}`)
      }

      const result = await response.json()
      console.log('[CardRecognition] Result:', result)
      return result
    } catch (err) {
      console.error('[CardRecognition] Error:', err)
      return null
    } finally {
      isProcessingRef.current = false
      setIsProcessing(false)
    }
  }, [])

  // Combined capture and recognize
  const captureAndRecognize = useCallback(async (videoElement: HTMLVideoElement): Promise<RecognitionResult | null> => {
    console.log('[CardRecognition] captureAndRecognize called')
    const frameData = captureFrame(videoElement)
    if (!frameData) {
      console.log('[CardRecognition] No frame data captured, aborting')
      return null
    }

    return recognizeCard(frameData)
  }, [captureFrame, recognizeCard])

  return {
    isProcessing,
    captureAndRecognize
  }
}
