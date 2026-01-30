import { useRef, useState, useCallback, type DragEvent } from 'react'
import { useProjectStore } from '@/store/useProjectStore'
import { validateImageFile, readFileAsDataUrl } from '@/utils/fileValidation'
import { EmptyState } from './EmptyState'

interface ImageUploadProps {
  onError?: (message: string) => void
}

export function ImageUpload({ onError }: ImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const setImage = useProjectStore((state) => state.setImage)

  const processFile = useCallback(
    async (file: File) => {
      const validation = validateImageFile(file)

      if (!validation.valid) {
        onError?.(validation.error?.message ?? 'Invalid file')
        return
      }

      setIsLoading(true)
      try {
        const dataUrl = await readFileAsDataUrl(file)
        setImage(file, dataUrl)
      } catch {
        onError?.('Failed to read image file. Please try again.')
      } finally {
        setIsLoading(false)
      }
    },
    [setImage, onError]
  )

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (file) {
        processFile(file)
      }
      // Reset input so same file can be selected again
      event.target.value = ''
    },
    [processFile]
  )

  const handleDragEnter = useCallback((event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    // Only set to false if leaving the actual drop zone
    if (event.currentTarget === event.target) {
      setIsDragOver(false)
    }
  }, [])

  const handleDragOver = useCallback((event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }, [])

  const handleDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault()
      event.stopPropagation()
      setIsDragOver(false)

      const file = event.dataTransfer.files[0]
      if (file) {
        processFile(file)
      }
    },
    [processFile]
  )

  return (
    <div
      className="flex flex-1"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png"
        onChange={handleFileChange}
        className="hidden"
      />

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-gray-500">Loading image...</p>
          </div>
        </div>
      ) : (
        <EmptyState onUploadClick={handleUploadClick} isDragOver={isDragOver} />
      )}
    </div>
  )
}
