import { useLayoutEffect, useRef, useState } from 'react';

export function MappingReviewTitle({ text }: { text: string }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [truncated, setTruncated] = useState(false);

  useLayoutEffect(() => {
    const element = heading.current;
    if (!element) return;
    const measure = () => {
      const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
      setTruncated(element.scrollHeight > lineHeight * 2 + 1);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text]);

  return (
    <h5
      ref={heading}
      title={truncated ? text : undefined}
      tabIndex={truncated ? 0 : undefined}
      className="line-clamp-2 break-words rounded-sm text-sm leading-5 font-medium text-gray-900 focus:line-clamp-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:text-gray-100"
    >
      {text}
    </h5>
  );
}
