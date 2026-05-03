export default function ForecastLoading() {
  return (
    <div className="p-6 space-y-6">
      {/* Selector Skeleton */}
      <div className="h-10 w-64 bg-gray-200 animate-pulse rounded" />

      {/* Chart Skeleton */}
      <div className="h-64 w-full bg-gray-200 animate-pulse rounded" />

      {/* Stat Cards Skeleton */}
      <div className="flex gap-4">
        <div className="h-24 flex-1 bg-gray-200 animate-pulse rounded" />
        <div className="h-24 flex-1 bg-gray-200 animate-pulse rounded" />
        <div className="h-24 flex-1 bg-gray-200 animate-pulse rounded" />
      </div>
    </div>
  )
}
