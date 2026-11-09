const fs = require("fs");

const p = "components/gateway/files-view.tsx";
let s = fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const log = [];

function rep(name, from, to) {
  if (!s.includes(from)) {
    log.push("MISS " + name);
    return;
  }
  s = s.split(from).join(to);
  log.push("OK " + name);
}

rep(
  "features",
  "const filesTableFeatures = tableFeatures({ columnVisibilityFeature });",
  "const filesTableFeatures = tableFeatures({\n  columnVisibilityFeature,\n  rowSortingFeature,\n  sortedRowModel: createSortedRowModel(),\n});",
);

rep(
  "import-sorted",
  "  createColumnHelper,\n  FlexRender,\n",
  "  createColumnHelper,\n  createSortedRowModel,\n  FlexRender,\n",
);

rep(
  "import-rowsorting",
  "  FlexRender,\n  tableFeatures,\n",
  "  FlexRender,\n  rowSortingFeature,\n  tableFeatures,\n",
);

rep(
  "import-sortingtype",
  "  type ColumnVisibilityState,\n} from \"@tanstack/react-table\";",
  "  type ColumnVisibilityState,\n  type SortingState,\n} from \"@tanstack/react-table\";",
);

rep(
  "icons",
  "  IconChevronRight,\n",
  "  IconChevronDown,\n  IconChevronRight,\n  IconChevronUp,\n  IconChevronsUpDown,\n",
);

rep(
  "helper",
  "  typeof filesTableFeatures,\n  FilesTableRow\n>();",
  "  typeof filesTableFeatures,\n  FilesTableRow\n>();\n\nfunction SortHeader({\n  label,\n  column,\n}: {\n  label: string;\n  column: {\n    getIsSorted: () => false | \"asc\" | \"desc\";\n    getToggleSortingHandler: () => ((event: unknown) => void) | undefined;\n  };\n}) {\n  const sorted = column.getIsSorted();\n  const SortIcon =\n    sorted === \"asc\"\n      ? IconChevronUp\n      : sorted === \"desc\"\n        ? IconChevronDown\n        : IconChevronsUpDown;\n\n  return (\n    <Button\n      variant=\"ghost\"\n      size=\"sm\"\n      className=\"-ml-2 h-8\"\n      onClick={column.getToggleSortingHandler()}\n    >\n      {label}\n      <SortIcon className=\"size-3.5\" />\n    </Button>\n  );\n}",
);

rep(
  "sorting-state",
  "  const [columnVisibility, setColumnVisibility] =\n    useState<ColumnVisibilityState>({});",
  "  const [columnVisibility, setColumnVisibility] =\n    useState<ColumnVisibilityState>({});\n  const [sorting, setSorting] = useState<SortingState>([]);",
);

rep(
  "header-name",
  "      header: \"Name\",",
  "      header: ({ column }) => <SortHeader label=\"Name\" column={column} />,",
);

rep(
  "header-size",
  "    filesColumnHelper.accessor(\"size\", { header: \"Size\" }),",
  "    filesColumnHelper.accessor(\"size\", {\n      header: ({ column }) => <SortHeader label=\"Size\" column={column} />,\n    }),",
);

rep(
  "header-account",
  "      header: \"Account\",",
  "      header: ({ column }) => <SortHeader label=\"Account\" column={column} />,",
);

rep(
  "header-folder",
  "      header: \"Folder\",",
  "      header: ({ column }) => <SortHeader label=\"Folder\" column={column} />,",
);

rep(
  "header-status",
  "      header: \"Status\",",
  "      header: ({ column }) => <SortHeader label=\"Status\" column={column} />,",
);

rep(
  "header-created",
  "      header: \"Created\",",
  "      header: ({ column }) => <SortHeader label=\"Created\" column={column} />,",
);

rep(
  "table-state",
  "    state: { columnVisibility },",
  "    state: { columnVisibility, sorting },",
);

rep(
  "table-onsorting",
  "    onColumnVisibilityChange: setColumnVisibility,",
  "    onColumnVisibilityChange: setColumnVisibility,\n    onSortingChange: setSorting,",
);

fs.writeFileSync(p, s);
console.log(log.join("\n"));
