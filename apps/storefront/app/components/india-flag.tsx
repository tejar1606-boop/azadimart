/**
 * The flag of India drawn to the Flag Code: 3:2, saffron · white · green
 * bands, navy Ashoka Chakra with 24 spokes in the centre of the white band.
 * Waving: the flag is cut into thin vertical strips that rise and fall one
 * after another (sharper and lighter than a GIF). Still when the shopper has
 * "reduce motion" on.
 */
const W = 900, H = 600, R = 92; // chakra radius ≈ 3/4 of the white band's height / 2
const spokes = Array.from({ length: 24 }, (_, i) => {
  const a = (i * Math.PI * 2) / 24;
  return `<line x1="450" y1="300" x2="${(450 + Math.cos(a) * R).toFixed(2)}" y2="${(300 + Math.sin(a) * R).toFixed(2)}"/>`;
}).join("");
const rimDots = Array.from({ length: 24 }, (_, i) => {
  const a = ((i + 0.5) * Math.PI * 2) / 24;
  return `<circle cx="${(450 + Math.cos(a) * (R - 6)).toFixed(2)}" cy="${(300 + Math.sin(a) * (R - 6)).toFixed(2)}" r="3.4"/>`;
}).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="200" fill="#FF9933"/><rect y="200" width="${W}" height="200" fill="#FFFFFF"/><rect y="400" width="${W}" height="200" fill="#138808"/><g fill="none" stroke="#000080"><circle cx="450" cy="300" r="${R}" stroke-width="7"/><g stroke-width="3">${spokes}</g></g><g fill="#000080"><circle cx="450" cy="300" r="15"/>${rimDots}</g></svg>`;
export const INDIA_FLAG_SVG = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

export default function IndiaFlag({ width = 72, wave = true, pole = true, className = "" }: { width?: number; wave?: boolean; pole?: boolean; className?: string }) {
  const height = Math.round((width * 2) / 3);
  const strips = Math.max(24, Math.round(width / 2.5)); // thin strips so the ripple reads as cloth, not columns
  const strip = width / strips;
  return (
    <span role="img" aria-label="Flag of India" className={"relative inline-flex items-start " + className} style={{ paddingLeft: pole ? 6 : 0, paddingTop: pole ? 4 : 0 }}>
      {pole ? (
        <span aria-hidden="true" className="absolute left-0 top-0 rounded-full" style={{ width: 3, height: height * 1.9, background: "linear-gradient(90deg,#9aa3b2,#f1f3f6 45%,#7c8594)" }}>
          <span className="absolute -left-[2px] -top-[3px] h-[7px] w-[7px] rounded-full" style={{ background: "radial-gradient(circle at 35% 35%,#fff,#c9a227 60%,#8a6d10)" }} />
        </span>
      ) : null}
      <span aria-hidden="true" className="relative flex" style={{ width, height, filter: "drop-shadow(0 4px 6px rgba(0,0,0,.25))" }}>
        {Array.from({ length: strips }, (_, i) => (
          <span
            key={i}
            className={wave ? "india-flag-strip" : undefined}
            style={{
              width: strip + 0.5, // slight overlap hides hairline gaps between strips
              height,
              backgroundImage: `url("${INDIA_FLAG_SVG}")`,
              backgroundSize: `${width}px ${height}px`,
              backgroundPosition: `${-i * strip}px 0`,
              // Movement grows away from the pole, and each strip runs a little behind the last: a travelling wave.
              ["--flag-amp" as string]: `${(height * 0.055 * Math.pow(i / strips, 0.8)).toFixed(2)}px`,
              animationDelay: `${(-(i / strips) * 1.6).toFixed(3)}s`,
              borderRadius: i === strips - 1 ? "0 2px 2px 0" : undefined,
            }}
          />
        ))}
      </span>
    </span>
  );
}
