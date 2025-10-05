import React from 'react'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  placeholder?: string
  disabled?: boolean
}

export default function SearchBar({ value, onChange, onSubmit, placeholder, disabled }: SearchBarProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!disabled) onSubmit?.()
      }}
      className="w-full"
      role="search"
      aria-label="Search for a location"
    >
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "Search…"}
          disabled={disabled}
          className="flex-1 rounded-xl border border-gray-300 bg-white/90 px-4 py-2 shadow-md outline-none placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={disabled}
          className="rounded-xl bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          Search
        </button>
      </div>
    </form>
  )
}
