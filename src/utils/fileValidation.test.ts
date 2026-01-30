import { describe, it, expect } from 'vitest'
import {
  validateImageFile,
  VALID_IMAGE_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
} from './fileValidation'

function createMockFile(name: string, size: number, type: string): File {
  // For small sizes, create actual content
  // For large sizes, create a small file and override the size property
  if (size <= 1024 * 1024) {
    const content = new Array(size).fill('a').join('')
    return new File([content], name, { type })
  }

  // For large files, create a mock with overridden size
  const smallContent = 'a'
  const file = new File([smallContent], name, { type })
  Object.defineProperty(file, 'size', { value: size, writable: false })
  return file
}

describe('fileValidation', () => {
  describe('validateImageFile', () => {
    describe('valid files', () => {
      it('should accept JPEG files', () => {
        const file = createMockFile('test.jpg', 1000, 'image/jpeg')
        const result = validateImageFile(file)
        expect(result.valid).toBe(true)
        expect(result.error).toBeUndefined()
      })

      it('should accept PNG files', () => {
        const file = createMockFile('test.png', 1000, 'image/png')
        const result = validateImageFile(file)
        expect(result.valid).toBe(true)
        expect(result.error).toBeUndefined()
      })

      it('should accept files at exactly max size', () => {
        const file = createMockFile(
          'test.png',
          MAX_FILE_SIZE_BYTES,
          'image/png'
        )
        const result = validateImageFile(file)
        expect(result.valid).toBe(true)
      })
    })

    describe('invalid file types', () => {
      it('should reject GIF files', () => {
        const file = createMockFile('test.gif', 1000, 'image/gif')
        const result = validateImageFile(file)
        expect(result.valid).toBe(false)
        expect(result.error?.type).toBe('invalid_type')
        expect(result.error?.message).toContain('JPEG or PNG')
      })

      it('should reject PDF files', () => {
        const file = createMockFile('test.pdf', 1000, 'application/pdf')
        const result = validateImageFile(file)
        expect(result.valid).toBe(false)
        expect(result.error?.type).toBe('invalid_type')
      })

      it('should reject files with no type', () => {
        const file = createMockFile('test', 1000, '')
        const result = validateImageFile(file)
        expect(result.valid).toBe(false)
        expect(result.error?.type).toBe('invalid_type')
        expect(result.error?.message).toContain('unknown')
      })

      it('should reject WebP files', () => {
        const file = createMockFile('test.webp', 1000, 'image/webp')
        const result = validateImageFile(file)
        expect(result.valid).toBe(false)
        expect(result.error?.type).toBe('invalid_type')
      })
    })

    describe('file size limits', () => {
      it('should reject files exceeding max size', () => {
        const file = createMockFile(
          'large.png',
          MAX_FILE_SIZE_BYTES + 1,
          'image/png'
        )
        const result = validateImageFile(file)
        expect(result.valid).toBe(false)
        expect(result.error?.type).toBe('file_too_large')
        expect(result.error?.message).toContain(`${MAX_FILE_SIZE_MB} MB`)
      })

      it('should reject empty files', () => {
        const file = createMockFile('empty.png', 0, 'image/png')
        const result = validateImageFile(file)
        expect(result.valid).toBe(false)
        expect(result.error?.type).toBe('empty_file')
        expect(result.error?.message).toContain('empty')
      })
    })
  })

  describe('constants', () => {
    it('should have correct valid image types', () => {
      expect(VALID_IMAGE_TYPES).toContain('image/jpeg')
      expect(VALID_IMAGE_TYPES).toContain('image/png')
      expect(VALID_IMAGE_TYPES.length).toBe(3) // jpeg, jpg, png
    })

    it('should have 50MB max file size', () => {
      expect(MAX_FILE_SIZE_BYTES).toBe(50 * 1024 * 1024)
      expect(MAX_FILE_SIZE_MB).toBe(50)
    })
  })
})
