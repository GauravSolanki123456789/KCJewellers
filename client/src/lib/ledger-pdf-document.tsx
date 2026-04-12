import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#111",
  },
  title: { fontSize: 16, marginBottom: 8, fontWeight: "bold" },
  sub: { fontSize: 9, color: "#444", marginBottom: 16 },
  row: { flexDirection: "row", marginBottom: 4 },
  label: { width: 140, fontWeight: "bold" },
  val: { flex: 1 },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#999",
    paddingBottom: 4,
    marginTop: 12,
    fontWeight: "bold",
  },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ddd", paddingVertical: 4 },
  c1: { width: "22%" },
  c2: { width: "18%" },
  c3: { width: "20%" },
  c4: { width: "40%" },
});

export type LedgerPdfEntry = {
  id: number;
  entry_type: string;
  rupee_delta: number;
  fine_metal_delta_grams: number;
  metal_type?: string | null;
  description?: string | null;
  reference?: string | null;
  created_at: string;
};

type Props = {
  customerName: string;
  generatedAt: string;
  rupeeBalance: number;
  fineMetalGrams: number;
  entries: LedgerPdfEntry[];
};

function typeLabel(t: string): string {
  switch (t) {
    case "PURCHASE":
      return "Purchase";
    case "CASH_PAYMENT":
      return "Cash payment";
    case "METAL_DEPOSIT":
      return "Metal deposit";
    default:
      return t;
  }
}

export function LedgerPdfDocument({
  customerName,
  generatedAt,
  rupeeBalance,
  fineMetalGrams,
  entries,
}: Props) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>KC Jewellers — Account statement (Khata)</Text>
        <Text style={styles.sub}>Generated: {generatedAt}</Text>

        <View style={styles.row}>
          <Text style={styles.label}>Customer</Text>
          <Text style={styles.val}>{customerName}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Rupee balance (outstanding)</Text>
          <Text style={styles.val}>
            ₹{rupeeBalance.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Fine metal balance (grams)</Text>
          <Text style={styles.val}>
            {fineMetalGrams.toLocaleString("en-IN", { maximumFractionDigits: 3 })} g
          </Text>
        </View>

        <View style={styles.tableHeader}>
          <Text style={styles.c1}>Date</Text>
          <Text style={styles.c2}>Type</Text>
          <Text style={styles.c3}>Rupee Δ</Text>
          <Text style={styles.c4}>Fine metal Δ (g)</Text>
        </View>
        {entries.map((e) => (
          <View key={e.id} style={styles.tr} wrap={false}>
            <Text style={styles.c1}>
              {new Date(e.created_at).toLocaleString("en-IN", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </Text>
            <Text style={styles.c2}>{typeLabel(e.entry_type)}</Text>
            <Text style={styles.c3}>
              ₹{Number(e.rupee_delta).toLocaleString("en-IN")}
            </Text>
            <Text style={styles.c4}>
              {Number(e.fine_metal_delta_grams).toLocaleString("en-IN", {
                maximumFractionDigits: 4,
              })}
            </Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}
