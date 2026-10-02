export function JobText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-3 text-body text-copy">
      {blocks.map((block, index) => {
        const lines = block.split("\n").map((line) => line.trim());
        const bullets = lines.filter((line) => line.startsWith("- "));
        const prose = lines.filter((line) => line && !line.startsWith("- "));
        return (
          <div key={index} className="space-y-2">
            {prose.map((line, lineIndex) => (
              <p key={lineIndex}>{line}</p>
            ))}
            {bullets.length > 0 && (
              <ul className="list-disc space-y-1 pl-5">
                {bullets.map((line, lineIndex) => (
                  <li key={lineIndex}>{line.slice(2).trim()}</li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
