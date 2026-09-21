import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import type { TimeSeriesDataPoint } from "../types";

interface RunsTableProps {
  data: TimeSeriesDataPoint[];
}

export function RunsTable({ data }: RunsTableProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-muted-foreground">
        No run data available
      </div>
    );
  }

  // Sort by date (newest first)
  const sortedData = [...data].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div className="rounded-md border">
      <Table aria-label="Recent runs">
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Commit</TableHead>
            <TableHead className="text-right">Run #</TableHead>
            <TableHead className="text-right">Line Coverage</TableHead>
            <TableHead className="text-right">Branch Coverage</TableHead>
            <TableHead className="text-right">Tests Passed</TableHead>
            <TableHead className="text-right">Pass Rate</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedData.slice(0, 10).map((point) => (
            <TableRow key={point.runId}>
              <TableCell>
                {format(point.date, "MMM dd, yyyy HH:mm")}
              </TableCell>
              <TableCell>
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                  {point.commitSha.substring(0, 7)}
                </code>
              </TableCell>
              <TableCell className="text-right">
                {point.runNumber}
              </TableCell>
              <TableCell className="text-right">
                {point.coverage ? (
                  <Badge variant={point.coverage.lineRate >= 80 ? "default" : point.coverage.lineRate >= 50 ? "secondary" : "destructive"}>
                    {point.coverage.lineRate.toFixed(1)}%
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                {point.coverage ? (
                  <Badge variant={point.coverage.branchRate >= 80 ? "default" : point.coverage.branchRate >= 50 ? "secondary" : "destructive"}>
                    {point.coverage.branchRate.toFixed(1)}%
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                {point.tests ? (
                  <span>
                    {point.tests.passed}/{point.tests.total}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                {point.tests ? (
                  <Badge variant={point.tests.passRate >= 90 ? "default" : point.tests.passRate >= 70 ? "secondary" : "destructive"}>
                    {point.tests.passRate.toFixed(1)}%
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
