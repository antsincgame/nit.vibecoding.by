import { useMemo } from "react";

interface ParticleFieldProps {
  count?: number;
  color?: string;
}

type Particle = {
  id: number;
  left: string;
  delay: string;
  duration: string;
  size: number;
};

function generateParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: `${(i * 37 + 13) % 100}%`,
    delay: `${(i * 1.7) % 8}s`,
    duration: `${6 + (i * 0.5) % 6}s`,
    size: 2 + (i % 3),
  }));
}

export function ParticleField({ count = 15, color = "#ffd700" }: ParticleFieldProps) {
  const particles = useMemo(() => generateParticles(count), [count]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute rounded-full animate-float-particle"
          style={{
            left: p.left,
            bottom: "-10px",
            width: p.size,
            height: p.size,
            background: color,
            animationDelay: p.delay,
            animationDuration: p.duration,
          }}
        />
      ))}
    </div>
  );
}
