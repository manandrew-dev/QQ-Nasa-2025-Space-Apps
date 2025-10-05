interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
}

export default function SearchBar({ value, onChange, onSubmit }: SearchBarProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit?.()
      }}
      className="w-full"
    >
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search for a location..."
        className="w-full rounded-xl border border-gray-300 bg-white/90 px-4 py-2 shadow-md outline-none placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
      />
    </form>
  )
}
