"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { AvailabilitySlice, ChannelDay, TrendCard } from "@/lib/admin/types";

// Charts reproduced from the prototype's inline SVG (part-d-admin/01-overview.html):
// same viewBoxes, scales, colours and hover read-outs.

interface Tip {
  x: number;
  y: number;
  text: string;
}

function useTip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const show = (e: React.MouseEvent, text: string) => setTip({ x: e.clientX, y: e.clientY, text });
  const hide = () => setTip(null);
  // Portal to <body>: the hovered .az-panel is transformed, which would offset a fixed child.
  const node = tip
    ? createPortal(
    <div
      className="pointer-events-none fixed z-[9999] rounded-[7px] bg-ink px-[9px] py-[5px] text-[11.5px] font-semibold text-paper shadow-[0_6px_18px_rgba(28,25,23,.28)]"
      style={{ left: tip.x + 12, top: tip.y - 34 }}
    >
      {tip.text}
    </div>,
        document.body,
      )
    : null;
  return { show, hide, node };
}

const CARD = "az-panel min-w-0 rounded-[18px] border border-line px-5 py-[18px]";

function CardHead({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2.5">
      <h3 className="m-0 text-[14.5px] font-bold text-ink">{title}</h3>
      <span className="text-[11px] font-semibold text-mauve">{meta}</span>
    </div>
  );
}

function Legend({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[#57534e]">
      <i className="inline-block h-[9px] w-[9px] rounded-[3px]" style={{ background: color }} />
      {children}
    </span>
  );
}

/** Area sparkline for the last 30 days (viewBox 420 × 110). */
export function TrendChart({ card, gradientId }: { card: TrendCard; gradientId: string }) {
  const { show, hide, node } = useTip();
  const values = card.points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const step = 408 / (values.length - 1);
  const pts = values.map((v, i) => ({
    x: 6 + i * step,
    y: 104 - ((v - min) / (max - min || 1)) * 98,
  }));
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];

  return (
    <div className={CARD}>
      <CardHead title={card.title} meta={card.window} />
      <div className="mt-3">
        <div className="mt-0.5 flex items-baseline gap-[9px]">
          <b className="text-[30px] font-bold text-ink tabular-nums">{card.headline}</b>
          <span className="text-[12px] font-bold text-emerald-700">{card.delta}</span>
        </div>
        <svg
          viewBox="0 0 420 110"
          width="100%"
          height="110"
          role="img"
          aria-label={card.ariaLabel}
          className="block overflow-visible"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={card.color} stopOpacity=".20" />
              <stop offset="1" stopColor={card.color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[27.5, 55, 82.5].map((y) => (
            <line key={y} x1="0" y1={y} x2="420" y2={y} stroke="#ece5da" strokeWidth="1" />
          ))}
          <path d={`${line} L${last.x.toFixed(1)} 106.0 L6.0 106.0 Z`} fill={`url(#${gradientId})`} />
          <path
            d={line}
            fill="none"
            stroke={card.color}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle cx={last.x} cy={last.y} r="4.5" fill={card.color} stroke="#fffdf8" strokeWidth="2" />
          {pts.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="9"
              fill="transparent"
              className="cursor-crosshair"
              onMouseMove={(e) => show(e, card.points[i].label)}
              onMouseLeave={hide}
            />
          ))}
          <text x="0" y="10" fontSize="9.5" fill="#8a8296" fontWeight="600">
            {card.topLabel}
          </text>
          <text x="0" y="108" fontSize="9.5" fill="#8a8296" fontWeight="600">
            {card.bottomLabel}
          </text>
        </svg>
      </div>
      {node}
    </div>
  );
}

const CHANNEL_COLORS = { chat: "#2a78d6", voice: "#eb6834", video: "#1baf7a" } as const;
const intl = (n: number) => n.toLocaleString("en-IN");

/** Stacked bars of chat / voice / video consultations for the last 14 days (viewBox 460 × 150). */
export function ChannelChart({ days }: { days: ChannelDay[] }) {
  const { show, hide, node } = useTip();
  // The prototype scales to the busiest day rounded up to the next 10.
  const maxTotal = Math.ceil(Math.max(...days.map((d) => d.chat + d.voice + d.video)) / 10) * 10;
  const k = 115 / maxTotal; // px per consultation
  const pitch = (460 + 8) / days.length;
  const width = pitch - 8;

  return (
    <div className={CARD}>
      <CardHead title="Consultations by channel" meta="last 14 days" />
      <div className="mt-2 flex flex-wrap gap-3.5">
        <Legend color={CHANNEL_COLORS.chat}>Chat</Legend>
        <Legend color={CHANNEL_COLORS.voice}>Voice</Legend>
        <Legend color={CHANNEL_COLORS.video}>Video</Legend>
      </div>
      <div className="mt-3">
        <svg
          viewBox="0 0 460 150"
          width="100%"
          height="150"
          role="img"
          aria-label="Consultations by channel, last 14 days"
          className="block overflow-visible"
        >
          {days.map((d, i) => {
            const x = i * pitch;
            let bottom = 130;
            const segs = (["chat", "voice", "video"] as const).map((ch, j) => {
              const full = d[ch] * k;
              const h = full - 2;
              const y = bottom - h;
              bottom -= full;
              const name = ch[0].toUpperCase() + ch.slice(1);
              return (
                <rect
                  key={ch}
                  x={x.toFixed(1)}
                  y={y.toFixed(1)}
                  width={width.toFixed(1)}
                  height={h.toFixed(1)}
                  rx={j === 2 ? 4 : 0}
                  fill={CHANNEL_COLORS[ch]}
                  onMouseMove={(e) => show(e, `${name} · ${intl(d[ch])}`)}
                  onMouseLeave={hide}
                />
              );
            });
            return (
              <g key={d.day}>
                {segs}
                <text
                  x={(x + width / 2).toFixed(1)}
                  y="145"
                  textAnchor="middle"
                  fontSize="9.5"
                  fill="#8a8296"
                  fontWeight="600"
                >
                  {d.day}
                </text>
              </g>
            );
          })}
        </svg>
        <details className="mt-2.5">
          <summary className="cursor-pointer text-[11.5px] font-bold text-[#57534e]">Table view</summary>
          <table className="mt-2 w-full border-collapse text-[11.5px]">
            <thead>
              <tr className="text-left text-[10px] tracking-[.06em] text-mauve uppercase">
                <th className="pr-2.5 pb-1">Day</th>
                <th className="px-2.5 pb-1 text-right">Chat</th>
                <th className="px-2.5 pb-1 text-right">Voice</th>
                <th className="px-2.5 pb-1 text-right">Video</th>
                <th className="pb-1 pl-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.day}>
                  <td className="py-[3px] pr-2.5 text-[#57534e]">{d.day}</td>
                  <td className="px-2.5 py-[3px] text-right tabular-nums">{intl(d.chat)}</td>
                  <td className="px-2.5 py-[3px] text-right tabular-nums">{intl(d.voice)}</td>
                  <td className="px-2.5 py-[3px] text-right tabular-nums">{intl(d.video)}</td>
                  <td className="py-[3px] pl-2.5 text-right font-bold tabular-nums">
                    {intl(d.chat + d.voice + d.video)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
      {node}
    </div>
  );
}

/** Horizontal share bar of the astrologer roster. */
export function AvailabilityCard({ slices, registered }: { slices: AvailabilitySlice[]; registered: number }) {
  return (
    <div className={CARD}>
      <CardHead title="Astrologer availability" meta={`live roster · ${registered} registered`} />
      <div className="mt-3">
        <div className="flex h-[22px] overflow-hidden rounded-lg">
          {slices.map((s, i) => (
            <div
              key={s.label}
              title={`${s.label}: ${s.count}`}
              className="h-full shadow-[inset_0_0_0_2px_#fffdf8]"
              style={{
                flex: s.count,
                background: s.color,
                borderRadius: i === 0 ? "8px 0 0 8px" : i === slices.length - 1 ? "0 8px 8px 0" : undefined,
              }}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4">
          {slices.map((s) => (
            <Legend key={s.label} color={s.color}>
              {s.label} <b className="text-ink tabular-nums">{s.count}</b>
            </Legend>
          ))}
        </div>
        <p className="mt-3 mb-0 text-[11.5px] leading-[1.5] text-[#57534e]">
          Busy includes live rooms, fixed sessions and instant calls. A break is astrologer-set and auto-clears after
          30 minutes.
        </p>
      </div>
    </div>
  );
}
