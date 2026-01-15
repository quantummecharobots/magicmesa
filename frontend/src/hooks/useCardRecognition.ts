import { useState, useCallback } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'https://localhost:3001'

interface RecognitionResult {
  cardName: string | null
}

export function useCardRecognition() {
  const [isProcessing, setIsProcessing] = useState(false)

  // Capture a frame from the video element (full frame for Claude Vision)
  const captureFrame = useCallback((videoElement: HTMLVideoElement): string | null => {
    if (!videoElement || videoElement.readyState < 2) {
      return null
    }

    const canvas = document.createElement('canvas')
    canvas.width = videoElement.videoWidth
    canvas.height = videoElement.videoHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(videoElement, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.8)
  }, [])

  // Send image to backend for Claude Vision recognition
  const recognizeCard = useCallback(async (imageData: string): Promise<RecognitionResult | null> => {
    if (isProcessing) {
      return null
    }

    setIsProcessing(true)

    try {
      const response = await fetch(`${API_URL}/api/recognize-card`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ image: imageData })
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const result = await response.json()
      console.log('[CardRecognition] Result:', result)
      return result
    } catch (err) {
      console.error('[CardRecognition] Error:', err)
      return null
    } finally {
      setIsProcessing(false)
    }
  }, [isProcessing])

  // Combined capture and recognize
  const captureAndRecognize = useCallback(async (videoElement: HTMLVideoElement): Promise<RecognitionResult | null> => {
    const frameData = captureFrame(videoElement)
    if (!frameData) return null

    return recognizeCard(frameData)
  }, [captureFrame, recognizeCard])

  return {
    isProcessing,
    captureAndRecognize
  }
}
