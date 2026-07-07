type StatisticProps = {
  value: string;
  description: string;
};

/**
 * A single statistic with a value and description.
 */
export function Statistic({ value, description }: StatisticProps) {
  return (
    <div className="flex flex-col items-center text-center md:items-start md:text-left gap-0 w-[150px]">
      <h3 className="text-2xl font-semibold">{value}</h3>
      <p className="text-primary text-xs font-light">{description}</p>
    </div>
  );
}

type StatisticGridProps = {
  stats: StatisticProps[];
};

/**
 * A responsive, bordered grid of {@link Statistic} components.
 */
export function StatisticGrid({ stats }: StatisticGridProps) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-4 border-y border-y-muted/25 py-3">
      {stats.map((stat) => (
        <Statistic key={stat.value} {...stat} />
      ))}
    </div>
  );
}
