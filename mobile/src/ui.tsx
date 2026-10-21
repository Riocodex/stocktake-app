import type { ReactNode } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { mediaUrl } from "./api";
import { colors } from "./theme";

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function Badge({
  children,
  tone = "draft",
}: {
  children: string;
  tone?: "draft" | "filed" | "low" | "sage";
}) {
  return (
    <Text style={[styles.badge, styles[`badge_${tone}`]]}>{children}</Text>
  );
}

export function StatCard({
  label,
  value,
  hint,
  onPress,
}: {
  label: string;
  value: string;
  hint?: string;
  onPress?: () => void;
}) {
  const content = (
    <>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable style={styles.stat} onPress={onPress}>
        {content}
      </Pressable>
    );
  }

  return <View style={styles.stat}>{content}</View>;
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.primary, disabled && { opacity: 0.55 }]}
    >
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

export function ProductThumb({
  uri,
  name,
  size = 44,
}: {
  uri?: string | null;
  name: string;
  size?: number;
}) {
  const src = mediaUrl(uri);
  if (src) {
    return (
      <Image
        source={{ uri: src }}
        style={{ width: size, height: size, borderRadius: 12, backgroundColor: colors.creamDeep }}
      />
    );
  }
  return (
    <View
      style={[
        styles.initials,
        { width: size, height: size, borderRadius: 12 },
      ]}
    >
      <Text style={styles.initialsText}>{name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

export function ProgressRing({
  counted,
  total,
  size = 68,
}: {
  counted: number;
  total: number;
  size?: number;
}) {
  const pct = total > 0 ? counted / total : 0;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#e9dccc"
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.sage}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - pct)}
          strokeLinecap="round"
          rotation="-90"
          originX={size / 2}
          originY={size / 2}
        />
      </Svg>
      <Text style={styles.ringPct}>{Math.round(pct * 100)}%</Text>
    </View>
  );
}

export function OutletPicker({
  outlets,
  value,
  onChange,
}: {
  outlets: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  if (outlets.length === 0) return null;
  return (
    <View style={styles.picker}>
      <Pressable
        onPress={() => onChange("")}
        style={[styles.pick, !value && styles.pickOn]}
      >
        <Text style={[styles.pickText, !value && styles.pickTextOn]}>All</Text>
      </Pressable>
      {outlets.map((outlet) => (
        <Pressable
          key={outlet.id}
          onPress={() => onChange(outlet.id)}
          style={[styles.pick, value === outlet.id && styles.pickOn]}
        >
          <Text style={[styles.pickText, value === outlet.id && styles.pickTextOn]}>
            {outlet.name.replace("TRiBE ", "")}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    color: colors.clay,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  badge: {
    fontSize: 11,
    fontWeight: "800",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  badge_draft: { backgroundColor: "#fef3c7", color: "#92400e" },
  badge_filed: { backgroundColor: "#d1fae5", color: "#065f46" },
  badge_low: { backgroundColor: "#fee2e2", color: "#991b1b" },
  badge_sage: { backgroundColor: "#dbecea", color: "#225567" },
  stat: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 12,
    minWidth: 90,
  },
  statLabel: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  statValue: { color: colors.ink, fontSize: 16, fontWeight: "800", marginTop: 4 },
  statHint: { color: colors.muted, fontSize: 11, marginTop: 4 },
  primary: {
    backgroundColor: colors.clay,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryText: { color: colors.white, fontWeight: "800", fontSize: 16 },
  initials: {
    backgroundColor: colors.creamDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  initialsText: { color: colors.inkSoft, fontWeight: "800" },
  ringPct: { color: colors.ink, fontWeight: "800", fontSize: 13 },
  picker: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  pick: {
    borderWidth: 1,
    borderColor: "rgba(58,37,31,0.15)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.white,
  },
  pickOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  pickText: { color: colors.ink, fontWeight: "700", fontSize: 12 },
  pickTextOn: { color: colors.cream },
});
