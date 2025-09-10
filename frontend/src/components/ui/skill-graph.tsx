import React from "react";

export function SkillGraph({ skills, topLanguages }: { skills: string[], topLanguages?: Record<string, number> }) {
    if (!skills || skills.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-10 text-center border rounded-2xl" style={{ borderColor: 'var(--border-subtle)' }}>
                <p className="text-4xl mb-3">🕸️</p>
                <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Skill Graph Empty</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Sync your GitHub to generate your proof-of-work nodes.</p>
            </div>
        );
    }

    // A very simple deterministic visual scatter approach to create a "graph" look for MVP.
    // We place a central node "You", and orbit the skills around it based on index.
    const radius = 120;
    const centerX = 200;
    const centerY = 200;

    // We highlight languages that have high bytes
    const getProficiency = (skill: string) => {
        if (!topLanguages) return 50;
        // Just a visual hack for MVP: if it's explicitly a top language, give it a higher visual weight.
        const isTop = Object.keys(topLanguages).slice(0, 3).includes(skill);
        return isTop ? 95 : 60;
    };

    return (
        <div className="relative w-full overflow-hidden flex items-center justify-center bg-transparent rounded-2xl" style={{ minHeight: '400px', backgroundColor: 'var(--bg-deep)' }}>
            {/* Background Grid */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'linear-gradient(var(--cyan) 1px, transparent 1px), linear-gradient(90deg, var(--cyan) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

            <svg className="w-full max-w-[400px]" viewBox="0 0 400 400" aria-label="Skill Graph Visualization">
                <defs>
                    <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="var(--cyan)" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="var(--cyan)" stopOpacity="0" />
                    </radialGradient>
                </defs>

                {/* Draw edges from central point to all skills */}
                {skills.slice(0, 12).map((skill, i, arr) => {
                    const angle = (i / arr.length) * 2 * Math.PI - Math.PI / 2;
                    const nodeRadius = radius * (0.8 + (i % 3) * 0.15); // Stagger distances
                    const x = centerX + nodeRadius * Math.cos(angle);
                    const y = centerY + nodeRadius * Math.sin(angle);

                    return (
                        <line
                            key={`edge-${skill}`}
                            x1={centerX}
                            y1={centerY}
                            x2={x}
                            y2={y}
                            stroke="var(--cyan)"
                            strokeWidth="1.5"
                            strokeOpacity="0.2"
                            strokeDasharray="4 4"
                        />
                    );
                })}

                {/* Central Root Node */}
                <circle cx={centerX} cy={centerY} r="35" fill="var(--bg-surface)" stroke="var(--cyan)" strokeWidth="2" />
                <circle cx={centerX} cy={centerY} r="50" fill="url(#nodeGlow)" />
                <text x={centerX} y={centerY} textAnchor="middle" dominantBaseline="middle" fill="var(--text-primary)" fontSize="12" fontWeight="bold">
                    CORE
                </text>

                {/* Skill Nodes */}
                {skills.slice(0, 12).map((skill, i, arr) => {
                    const angle = (i / arr.length) * 2 * Math.PI - Math.PI / 2;
                    const nodeRadius = radius * (0.8 + (i % 3) * 0.15);
                    const x = centerX + nodeRadius * Math.cos(angle);
                    const y = centerY + nodeRadius * Math.sin(angle);
                    const proficiency = getProficiency(skill);
                    const nodeSize = proficiency > 80 ? 24 : 18;

                    return (
                        <g key={`node-${skill}`} className="transition-transform duration-300 hover:scale-110 cursor-pointer">
                            {/* Node backing */}
                            <circle cx={x} cy={y} r={nodeSize} fill="var(--bg-elevated)" stroke="var(--border-subtle)" strokeWidth="1.5" />
                            {/* Node outline (proficiency indicator) */}
                            <circle
                                cx={x} cy={y} r={nodeSize}
                                fill="none"
                                stroke={proficiency > 80 ? "var(--cyan)" : "var(--text-muted)"}
                                strokeWidth="2"
                                strokeDasharray={`${(proficiency / 100) * (2 * Math.PI * nodeSize)} 999`}
                                strokeLinecap="round"
                                transform={`rotate(-90 ${x} ${y})`}
                            />
                            <text x={x} y={y - nodeSize - 8} textAnchor="middle" fill="var(--text-secondary)" fontSize="10" fontWeight="500">
                                {skill}
                            </text>
                            <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill="var(--text-primary)" fontSize={proficiency > 80 ? "18" : "12"}>
                                {proficiency > 80 ? "🌟" : "⚡"}
                            </text>
                        </g>
                    );
                })}
            </svg>

            {/* Legend */}
            <div className="absolute bottom-4 left-4 p-3 rounded-xl bg-black/40 backdrop-blur-md border" style={{ borderColor: 'var(--border-subtle)' }}>
                <p className="text-[10px] font-semibold tracking-wider uppercase mb-2 text-white/50">Node Legend</p>
                <div className="flex flex-col gap-1.5 text-xs text-white/80">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[var(--cyan)]" /> Proven Mastery
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full border border-[var(--text-muted)]" /> Verified Exposure
                    </div>
                </div>
            </div>
        </div>
    );
}
