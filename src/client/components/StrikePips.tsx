import { STRIKE_LIMIT } from "@shared/config";

export function StrikePips({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${Math.min(count, STRIKE_LIMIT)} / ${STRIKE_LIMIT}`}>
      {Array.from({ length: STRIKE_LIMIT }, (_, index) => {
        const filled = count > index;
        const hot = index === STRIKE_LIMIT - 1 && count >= STRIKE_LIMIT;
        return (
          <span
            key={index}
            className={`h-6 w-4 rounded-[4px] border-2 ${
              filled
                ? hot
                  ? "border-[#7a1020] bg-[#ff4d4d]"
                  : "border-[#8a6a00] bg-[#ffe14a]"
                : "border-white/35 bg-transparent"
            }`}
          />
        );
      })}
    </span>
  );
}
