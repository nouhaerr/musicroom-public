import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faArrowRight, faArrowUp, faArrowUpRightFromSquare, faChevronRight } from '@fortawesome/free-solid-svg-icons';

const arrows = {
  left: faArrowLeft,
  right: faArrowRight,
  'up-right': faArrowUpRightFromSquare,
  up: faArrowUp,
  chevron: faChevronRight,
} as const;

export function ArrowIcon({ direction, size = 16, className }: { direction: keyof typeof arrows; size?: number; className?: string }) {
  return <FontAwesomeIcon icon={arrows[direction]} className={className} style={{ width: size, height: size }} aria-hidden="true" />;
}
