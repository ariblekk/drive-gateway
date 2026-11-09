const fs = require("fs");

const p = "components/gateway/files-view.tsx";
let s = fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const log = [];

const helper = `function SortHeader({
  label,
  column,
}: {
  label: string;
  column: {
    getIsSorted: () => false | "asc" | "desc";
    getToggleSortingHandler: () => ((event: unknown) => void) | undefined;
  };
}) {
  const sorted = column.getIsSorted();
  const SortIcon =
    sorted === "asc"
      ? IconChevronUp
      : sorted === "desc"
        ? IconChevronDown
        : IconChevronsUpDown;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 h-8"
      onClick={column.getToggleSortingHandler()}
    >
      {label}
      <SortIcon className="size-3.5" />
    </Button>
  );
}`;

if (/function SortHeader\(/.test(s)) {
  log.push("SKIP helper exists");
} else {
  const re = /(const filesColumnHelper = createColumnHelper<[\s\S]*?\n>\(\);)/;
  if (re.test(s)) {
    s = s.replace(re, "$1\n\n" + helper);
    log.push("OK helper");
  } else {
    log.push("MISS helper-anchor");
  }
}

let count = (s.match(/const \[sorting, setSorting\]/g) || []).length;
if (count === 0) {
  const anchor =
    "  const [columnVisibility, setColumnVisibility] =\n    useState<ColumnVisibilityState>({});";
  if (s.includes(anchor)) {
    s = s.replace(anchor, anchor + "\n  const [sorting, setSorting] = useState<SortingState>([]);");
    log.push("OK sorting-state");
  } else {
    log.push("MISS sorting-state-anchor");
  }
} else {
  log.push("SKIP sorting-state exists x" + count);
}

const start = s.indexOf('import {\n  IconArrowsMove');
const endMarker = '} from "@tabler/icons-react";';
const end = start === -1 ? -1 : s.indexOf(endMarker, start);
if (start !== -1 && end !== -1) {
  const head = s.slice(0, start);
  const block = s.slice(start, end);
  const tail = s.slice(end);
  const seen = new Set();
  const out = [];
  for (const line of block.split("\n")) {
    const key = line.trim();
    if (key && seen.has(key)) {
      log.push("DEDUPE " + key);
      continue;
    }
    if (key) seen.add(key);
    out.push(line);
  }
  s = head + out.join("\n") + tail;
  log.push("OK icons-deduped");
}

fs.writeFileSync(p, s);
console.log(log.join("\n"));
