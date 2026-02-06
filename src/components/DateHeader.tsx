interface DateHeaderProps {
  date: Date;
}

export function DateHeader({ date }: DateHeaderProps) {
  const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
  
  // Get the week range (current week)
  const startOfWeek = new Date(date);
  const dayIndex = date.getDay();
  startOfWeek.setDate(date.getDate() - dayIndex);
  
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  const formatShortDate = (d: Date) => {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const weekRange = `${formatShortDate(startOfWeek)} - ${formatShortDate(endOfWeek)}`;

  return (
    <div className="mb-5">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">
        {dayOfWeek}
      </h1>
      <p className="text-xs text-[var(--color-muted)] uppercase tracking-wide mt-0.5">
        {weekRange}
      </p>
    </div>
  );
}
