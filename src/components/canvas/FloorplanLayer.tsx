import { useEffect, useState } from 'react'
import { Image as KonvaImage } from 'react-konva'
import { useProjectStore } from '@/store/useProjectStore'

export function FloorplanLayer() {
  const dataUrl = useProjectStore((state) => state.dataUrl)
  const [image, setImage] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    if (!dataUrl) {
      setImage(null)
      return
    }

    const img = new window.Image()
    img.onload = () => {
      setImage(img)
    }
    img.onerror = (err) => {
      console.error('[FloorplanLayer] Image failed to load:', err)
    }
    img.src = dataUrl

    return () => {
      img.onload = null
    }
  }, [dataUrl])

  if (!image) {
    return null
  }

  // listening={false} allows clicks to pass through to the stage for deselection
  return <KonvaImage image={image} x={0} y={0} listening={false} />
}
