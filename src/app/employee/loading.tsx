export default function EmployeeLoading() {
  return (
    <div className="space-y-5 animate-pulse p-1">
      {/* Employee Header Skeleton */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="h-6 w-36 bg-slate-200 rounded" />
        <div className="h-4 w-56 bg-slate-100 rounded" />
      </div>

      {/* Action Card Skeleton */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="h-5 w-40 bg-slate-200 rounded" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-16 bg-slate-100 rounded-lg" />
          <div className="h-16 bg-slate-100 rounded-lg" />
        </div>
        <div className="h-12 bg-emerald-100 rounded-lg" />
      </div>

      {/* History Items Skeleton */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="h-5 w-32 bg-slate-200 rounded" />
        <div className="space-y-2 pt-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 bg-slate-50 border border-slate-100 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

