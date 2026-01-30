interface EmptyStateProps {
  onUploadClick: () => void
  isDragOver?: boolean
}

export function EmptyState({ onUploadClick, isDragOver = false }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center p-8 transition-colors ${
        isDragOver ? 'bg-primary/5' : ''
      }`}
    >
      <div
        className={`flex max-w-md flex-col items-center rounded-lg border-2 border-dashed p-12 text-center transition-colors ${
          isDragOver
            ? 'border-primary bg-primary/10'
            : 'border-gray-300 bg-white'
        }`}
      >
        {/* Upload Icon */}
        <div
          className={`mb-4 rounded-full p-4 ${
            isDragOver ? 'bg-primary/20' : 'bg-gray-100'
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className={`h-12 w-12 ${isDragOver ? 'text-primary' : 'text-gray-400'}`}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
            />
          </svg>
        </div>

        {/* Title */}
        <h2 className="mb-2 text-xl font-semibold text-gray-900">
          {isDragOver ? 'Drop your floorplan here' : 'Upload a Floorplan'}
        </h2>

        {/* Description */}
        <p className="mb-6 text-gray-500">
          {isDragOver
            ? 'Release to upload your image'
            : 'Drag and drop an image here, or click to select a file'}
        </p>

        {/* Upload Button */}
        {!isDragOver && (
          <button
            onClick={onUploadClick}
            className="rounded-lg bg-primary px-6 py-3 font-medium text-white transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            Select Floorplan Image
          </button>
        )}

        {/* File Format Info */}
        <div className="mt-6 text-sm text-gray-400">
          <p>Supported formats: JPEG, PNG</p>
          <p>Maximum file size: 20 MB</p>
        </div>
      </div>
    </div>
  )
}
