interface Props {
  title: string;
  description?: string;
  phase?: string;
}

export default function ComingSoonPage({
  title,
  description,
  phase = "a future phase",
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center gap-4">
      <div className="text-6xl">🚧</div>
      <h2 className="text-2xl font-semibold text-slate-700">{title}</h2>
      <p className="text-slate-400 max-w-sm text-sm leading-relaxed">
        {description ??
          `This section will be available in ${phase}. The routing is already wired up and ready.`}
      </p>
      <span className="inline-block bg-slate-100 text-slate-500 border border-slate-200 text-xs font-medium px-3 py-1.5 rounded-full">
        Coming soon
      </span>
    </div>
  );
}
