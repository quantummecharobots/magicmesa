import { useState, useCallback, useRef } from 'react'

// Use same origin as frontend - Vite proxy routes /api to backend
const API_URL = import.meta.env.VITE_API_URL || window.location.origin

interface RecognitionResult {
  cardName: string | null
}

interface ClickPosition {
  x: number  // 0-1 normalized position
  y: number  // 0-1 normalized position
}

interface CaptureOptions {
  clickPos?: ClickPosition
  flipped?: boolean
  mirrored?: boolean
  applyFlipToCoords?: boolean  // Default true. Set false for remote scans where coords are pre-transformed
}

export function useCardRecognition() {
  const [isProcessing, setIsProcessing] = useState(false)
  // Use ref to prevent stale closure issues with the processing check
  const isProcessingRef = useRef(false)

  // Capture a cropped region around the click point - simulating card detection
  const captureFrame = useCallback((videoElement: HTMLVideoElement, options?: CaptureOptions): string | null => {
    const { clickPos, flipped, mirrored, applyFlipToCoords = true } = options || {}
    console.log('[CardRecognition] captureFrame called, readyState:', videoElement?.readyState, 'videoWidth:', videoElement?.videoWidth, 'videoHeight:', videoElement?.videoHeight, 'clickPos:', clickPos, 'flipped:', flipped, 'mirrored:', mirrored, 'applyFlipToCoords:', applyFlipToCoords)

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

    const srcWidth = videoElement.videoWidth
    const srcHeight = videoElement.videoHeight

    // If we have a click position, crop around it
    // Card-shaped crop to isolate the clicked card precisely
    const cropWidthRatio = 0.10   // Crop 10% width
    const cropHeightRatio = 0.25  // Crop 25% height

    // Transform click coordinates if video is flipped/mirrored
    // The click is on the displayed (transformed) video, but we crop from raw video
    // For remote scans, coords are pre-transformed, so skip this step (applyFlipToCoords = false)
    let centerX = clickPos ? clickPos.x : 0.5
    let centerY = clickPos ? clickPos.y : 0.5

    if (applyFlipToCoords) {
      if (flipped) {
        // 180° rotation: both X and Y are inverted
        centerX = 1 - centerX
        centerY = 1 - centerY
      }
      if (mirrored) {
        // Horizontal flip: only X is inverted
        centerX = 1 - centerX
      }
    }

    console.log('[CardRecognition] Adjusted crop center:', centerX, centerY, '(flipped:', flipped, 'mirrored:', mirrored, 'applyFlipToCoords:', applyFlipToCoords, ')')

    const cropWidth = Math.floor(srcWidth * cropWidthRatio)
    const cropHeight = Math.floor(srcHeight * cropHeightRatio)

    // Calculate crop position, clamping to stay within bounds
    let cropX = Math.floor(centerX * srcWidth - cropWidth / 2)
    let cropY = Math.floor(centerY * srcHeight - cropHeight / 2)
    cropX = Math.max(0, Math.min(cropX, srcWidth - cropWidth))
    cropY = Math.max(0, Math.min(cropY, srcHeight - cropHeight))

    // Output at high resolution for the cropped region
    const outputSize = 1024
    const outWidth = outputSize
    const outHeight = outputSize

    const canvas = document.createElement('canvas')
    canvas.width = outWidth
    canvas.height = outHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      console.log('[CardRecognition] Could not get canvas context')
      return null
    }

    // Use better image scaling
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    // Apply transformations if needed (flip/mirror)
    ctx.save()
    if (flipped || mirrored) {
      ctx.translate(outWidth / 2, outHeight / 2)
      if (flipped) {
        ctx.rotate(Math.PI) // 180 degree rotation
      }
      if (mirrored) {
        ctx.scale(-1, 1) // Horizontal flip
      }
      ctx.translate(-outWidth / 2, -outHeight / 2)
    }

    // Draw cropped and scaled region
    ctx.drawImage(
      videoElement,
      cropX, cropY, cropWidth, cropHeight,  // Source crop
      0, 0, outWidth, outHeight              // Destination
    )
    ctx.restore()

    // Use PNG for lossless quality
    const dataUrl = canvas.toDataURL('image/png')
    console.log('[CardRecognition] Frame captured, crop:', cropWidth, 'x', cropHeight, 'at', cropX, ',', cropY, '-> output:', outWidth, 'x', outHeight, 'size:', Math.round(dataUrl.length / 1024), 'KB')

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
      console.log('[CardRecognition] Fetching from:', `${API_URL}/api/recognize-card`)
      const response = await fetch(`${API_URL}/api/recognize-card`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ image: imageData })
      })

      console.log('[CardRecognition] Response status:', response.status)

      if (!response.ok) {
        const text = await response.text()
        console.error('[CardRecognition] API error response:', text)
        throw new Error(`API error: ${response.status} - ${text}`)
      }

      const text = await response.text()
      console.log('[CardRecognition] Raw response text:', text)

      try {
        const result = JSON.parse(text)
        console.log('[CardRecognition] Parsed result:', result)
        return result
      } catch (parseErr) {
        console.error('[CardRecognition] JSON parse error:', parseErr, 'Text was:', text)
        return null
      }
    } catch (err) {
      console.error('[CardRecognition] Fetch error:', err)
      return null
    } finally {
      isProcessingRef.current = false
      setIsProcessing(false)
    }
  }, [])

  // Combined capture and recognize - options include click position and transformations
  const captureAndRecognize = useCallback(async (videoElement: HTMLVideoElement, options?: CaptureOptions): Promise<RecognitionResult | null> => {
    console.log('[CardRecognition] captureAndRecognize called, options:', options)
    const frameData = captureFrame(videoElement, options)
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

export type { ClickPosition, CaptureOptions }
