import React, { useCallback, useMemo, useState } from "react";
import {
	View,
	Text,
	StyleSheet,
	TouchableOpacity,
	SafeAreaView,
	StatusBar,
	TextInput,
	FlatList,
	Alert,
	Modal,
	Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "../../context/AppContext";

const MOCK_ROOMS = [
	{
		id: 1,
		name: "Room 1",
		status: "safe",
		temperature: 20,
		cameraEnabled: true,
		created: "2026-01-05",
	},
	{
		id: 2,
		name: "Room 2",
		status: "alert",
		temperature: 55,
		cameraEnabled: false,
		created: "2026-02-11",
	},
	{
		id: 3,
		name: "Room 3",
		status: "safe",
		temperature: 20,
		cameraEnabled: true,
		created: "2026-03-09",
	},
	{
		id: 4,
		name: "Room 4",
		status: "alert",
		temperature: 60,
		cameraEnabled: true,
		created: "2026-04-02",
	},
];

const getSortLabel = (sortBy) => {
	if (sortBy === "created") return "Sort by Date";
	return "Sort by Name";
};

export default function AdminRoomsTab() {
	const { sensorReading } = useApp();
	const liveTemperature = Number(sensorReading?.temperature ?? 0);
	const [rooms, setRooms] = useState(MOCK_ROOMS);
	const [search, setSearch] = useState("");
	const [sortBy, setSortBy] = useState("name");
	const [showSortMenu, setShowSortMenu] = useState(false);
	const [filterAlertsOnly, setFilterAlertsOnly] = useState(false);
	const [formOpen, setFormOpen] = useState(false);
	const [editingRoomId, setEditingRoomId] = useState(null);
	const [formName, setFormName] = useState("");
	const [formTemperature, setFormTemperature] = useState(String(liveTemperature));
	const [formCameraEnabled, setFormCameraEnabled] = useState(true);

	const visibleRooms = useMemo(() => {
		const query = search.trim().toLowerCase();
		let filtered = rooms.filter((room) => {
			const matchesSearch = room.name.toLowerCase().includes(query);
			const matchesAlertFilter = filterAlertsOnly ? room.status === "alert" : true;
			return matchesSearch && matchesAlertFilter;
		});

		filtered = filtered.sort((a, b) => {
			if (sortBy === "created") {
				return new Date(a.created).getTime() - new Date(b.created).getTime();
			}
			return a.name.localeCompare(b.name);
		});

		return filtered;
	}, [rooms, search, filterAlertsOnly, sortBy]);

	const openAddRoom = useCallback(() => {
		setEditingRoomId(null);
		setFormName("");
		setFormTemperature(String(liveTemperature));
		setFormCameraEnabled(true);
		setFormOpen(true);
	}, [liveTemperature]);

	const openEditRoom = useCallback((room) => {
		setEditingRoomId(room.id);
		setFormName(room.name);
		setFormTemperature(String(room.temperature));
		setFormCameraEnabled(room.cameraEnabled);
		setFormOpen(true);
	}, []);

	const saveRoom = useCallback(() => {
		const trimmedName = formName.trim();
		const parsedTemperature = Number.parseFloat(formTemperature);

		if (!trimmedName) {
			Alert.alert("Invalid room", "Room name is required.");
			return;
		}

		if (Number.isNaN(parsedTemperature)) {
			Alert.alert("Invalid temperature", "Temperature must be a valid number.");
			return;
		}

		const nextStatus = parsedTemperature >= liveTemperature ? "alert" : "safe";

		if (editingRoomId) {
			setRooms((current) =>
				current.map((room) =>
					room.id === editingRoomId
						? {
							...room,
							name: trimmedName,
							temperature: parsedTemperature,
							status: nextStatus,
							cameraEnabled: formCameraEnabled,
						}
						: room,
					),
				);
		} else {
			const nextId =
				rooms.length > 0 ? Math.max(...rooms.map((room) => room.id)) + 1 : 1;
			setRooms((current) => [
				...current,
				{
					id: nextId,
					name: trimmedName,
					temperature: parsedTemperature,
					status: nextStatus,
					cameraEnabled: formCameraEnabled,
					created: new Date().toISOString().slice(0, 10),
				},
			]);
		}

		setFormOpen(false);
	}, [editingRoomId, formName, formTemperature, formCameraEnabled, rooms, liveTemperature]);

	const deleteRoom = useCallback((roomId, roomName) => {
		Alert.alert("Delete Room", `Delete ${roomName}?`, [
			{ text: "Cancel", style: "cancel" },
			{
				text: "Delete",
				style: "destructive",
				onPress: () => {
					setRooms((current) => current.filter((room) => room.id !== roomId));
				},
			},
		]);
	}, []);

	const toggleCamera = useCallback((roomId) => {
		setRooms((current) =>
			current.map((room) =>
				room.id === roomId
					? { ...room, cameraEnabled: !room.cameraEnabled }
					: room,
			),
		);
	}, []);

	const renderRoom = ({ item }) => (
		<View style={styles.row}>
			<View style={styles.colRoom}>
				<Text style={styles.roomName}>{item.name}</Text>
				<Text style={styles.roomMeta}>Created: {item.created}</Text>
			</View>

			<View style={styles.colStatus}>
				<View
					style={[
						styles.badge,
						item.status === "alert" ? styles.alertBadge : styles.safeBadge,
					]}
				>
					<Text style={styles.badgeText}>{item.status}</Text>
				</View>
			</View>

			<View style={styles.colAlerts}>
				<Text style={styles.alertCount}>{item.temperature ?? liveTemperature}</Text>
			</View>

			<View style={styles.colCamera}>
				<TouchableOpacity
					style={styles.cameraToggle}
					onPress={() => toggleCamera(item.id)}
				>
					<Text style={styles.cameraLabel}>{item.cameraEnabled ? "Yes" : "No"}</Text>
				</TouchableOpacity>
			</View>

			<View style={styles.colActions}>
				<TouchableOpacity
					style={styles.iconBtn}
					onPress={() => openEditRoom(item)}
				>
					<Ionicons name="create-outline" size={18} color="#333" />
				</TouchableOpacity>
				<TouchableOpacity
					style={styles.iconBtn}
					onPress={() => deleteRoom(item.id, item.name)}
				>
					<Ionicons name="trash-outline" size={18} color="#e53935" />
				</TouchableOpacity>
			</View>
		</View>
	);

	return (
		<SafeAreaView style={styles.container}>
			<StatusBar barStyle="light-content" />

			<View style={styles.headerTop}>
				<Text style={styles.headerTitle}>Rooms Management</Text>
				<View style={styles.statsRow}>
					<View style={styles.statCard}>
						<Text style={styles.statNumber}>{rooms.length}</Text>
						<Text style={styles.statLabel}>Total Rooms</Text>
					</View>
					<View style={styles.statCard}>
							<Text style={styles.statNumber}>{rooms.filter((r) => r.status === "alert").length}</Text>
							<Text style={styles.statLabel}>Alert Rooms</Text>
					</View>
					<View style={styles.statCard}>
						<Text style={styles.statNumber}>{rooms.filter((r) => r.cameraEnabled).length}</Text>
						<Text style={styles.statLabel}>Camera Yes</Text>
					</View>
				</View>
			</View>

			<View style={styles.content}>
				<View style={styles.toolbar}>
					<View style={styles.searchBox}>
						<Ionicons name="search" size={18} color="#777" />
						<TextInput
							placeholder="Search room by name..."
							placeholderTextColor="#999"
							value={search}
							onChangeText={setSearch}
							style={styles.searchInput}
						/>
					</View>

					<View style={styles.controlsWrap}>
						<TouchableOpacity
							style={styles.sortBtn}
							onPress={() => setShowSortMenu((open) => !open)}
						>
							<Text style={styles.sortText}>{getSortLabel(sortBy)}</Text>
							<Ionicons
								name={showSortMenu ? "chevron-up" : "chevron-down"}
								size={16}
								color="#222"
							/>
						</TouchableOpacity>

						<TouchableOpacity
							style={[
								styles.alertFilterBtn,
								filterAlertsOnly ? styles.alertFilterBtnOn : null,
							]}
							onPress={() => setFilterAlertsOnly((current) => !current)}
						>
							<Text style={styles.alertFilterText}>Alert Rooms</Text>
						</TouchableOpacity>

						<TouchableOpacity style={styles.addBtn} onPress={openAddRoom}>
							<Ionicons name="add" size={16} color="#fff" />
							<Text style={styles.addText}>Add Room</Text>
						</TouchableOpacity>

						{showSortMenu ? (
							<View style={styles.sortMenu}>
								<TouchableOpacity
									style={styles.sortOption}
									onPress={() => {
										setSortBy("name");
										setShowSortMenu(false);
									}}
								>
									<Text style={styles.sortOptionText}>Sort by Name</Text>
									{sortBy === "name" ? (
										<Ionicons name="checkmark" size={18} color="#111" />
									) : null}
								</TouchableOpacity>
								<TouchableOpacity
									style={styles.sortOption}
									onPress={() => {
										setSortBy("created");
										setShowSortMenu(false);
									}}
								>
									<Text style={styles.sortOptionText}>Sort by Date</Text>
									{sortBy === "created" ? (
										<Ionicons name="checkmark" size={18} color="#111" />
									) : null}
								</TouchableOpacity>
							</View>
						) : null}
					</View>
				</View>

				<View style={styles.tableHeader}>
					<Text style={[styles.headerCell, styles.hRoom]}>Room</Text>
					<Text style={[styles.headerCell, styles.hStatus]}>Status</Text>
					<Text style={[styles.headerCell, styles.hAlerts]}>℃</Text>
					<Text style={[styles.headerCell, styles.hCamera]}>Camera</Text>
					<Text style={[styles.headerCell, styles.hActions]}>Actions</Text>
				</View>

				<FlatList
					data={visibleRooms}
					keyExtractor={(item) => String(item.id)}
					renderItem={renderRoom}
					ListEmptyComponent={<Text style={styles.empty}>No rooms found.</Text>}
				/>
			</View>

			<Modal visible={formOpen} transparent animationType="fade">
				<View style={styles.modalOverlay}>
					<View style={styles.modalCard}>
						<Text style={styles.modalTitle}>
							{editingRoomId ? "Update Room" : "Add Room"}
						</Text>

						<TextInput
							style={styles.input}
							value={formName}
							onChangeText={setFormName}
							placeholder="Room name"
							placeholderTextColor="#999"
						/>

						<TextInput
							style={styles.input}
							value={formTemperature}
							onChangeText={setFormTemperature}
							placeholder="Temperature value"
							placeholderTextColor="#999"
							keyboardType="numeric"
						/>

						<View style={styles.switchRow}>
							<Text style={styles.switchLabel}>Camera Enabled</Text>
							<Switch
								value={formCameraEnabled}
								onValueChange={setFormCameraEnabled}
								trackColor={{ false: "#d1d5db", true: "#f87171" }}
								thumbColor={formCameraEnabled ? "#e53935" : "#9ca3af"}
							/>
						</View>

						<View style={styles.modalActions}>
							<TouchableOpacity
								style={styles.cancelBtn}
								onPress={() => setFormOpen(false)}
							>
								<Text style={styles.cancelText}>Cancel</Text>
							</TouchableOpacity>
							<TouchableOpacity style={styles.saveBtn} onPress={saveRoom}>
								<Text style={styles.saveText}>Save</Text>
							</TouchableOpacity>
						</View>
					</View>
				</View>
			</Modal>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: "#fff" },
	headerTop: { backgroundColor: "#e53935", paddingVertical: 18, paddingHorizontal: 14 },
	headerTitle: { color: "#fff", fontSize: 20, fontWeight: "600", marginBottom: 12 },
	statsRow: { flexDirection: "row", justifyContent: "space-between" },
	statCard: {
		flex: 1,
		marginHorizontal: 4,
		backgroundColor: "rgba(255,255,255,0.14)",
		padding: 14,
		borderRadius: 8,
		alignItems: "center",
	},
	statNumber: { color: "#fff", fontSize: 20, fontWeight: "700" },
	statLabel: { color: "#fff", fontSize: 12, marginTop: 4 },
	content: { flex: 1, padding: 12 },
	toolbar: { marginBottom: 12 },
	searchBox: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#f2f2f2",
		padding: 8,
		borderRadius: 8,
		paddingHorizontal: 12,
		marginBottom: 10,
	},
	searchInput: { marginLeft: 8, flex: 1, color: "#222" },
	controlsWrap: { flexDirection: "row", alignItems: "center", position: "relative" },
	sortBtn: {
		backgroundColor: "#f3f4f6",
		borderWidth: 1,
		borderColor: "#e5e7eb",
		paddingHorizontal: 12,
		paddingVertical: 9,
		borderRadius: 10,
		marginRight: 8,
		minWidth: 130,
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	sortText: { color: "#111827", fontWeight: "600", marginRight: 6 },
	sortMenu: {
		position: "absolute",
		top: 46,
		left: 0,
		backgroundColor: "#fff",
		borderRadius: 10,
		borderWidth: 1,
		borderColor: "#e5e7eb",
		minWidth: 170,
		zIndex: 20,
		elevation: 5,
	},
	sortOption: {
		paddingVertical: 10,
		paddingHorizontal: 12,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	sortOptionText: { color: "#111827", fontSize: 15 },
	alertFilterBtn: {
		backgroundColor: "#f3f4f6",
		borderWidth: 1,
		borderColor: "#e5e7eb",
		paddingHorizontal: 12,
		paddingVertical: 9,
		borderRadius: 10,
		marginRight: 8,
	},
	alertFilterBtnOn: {
		backgroundColor: "#fee2e2",
		borderColor: "#fca5a5",
	},
	alertFilterText: { color: "#991b1b", fontWeight: "600" },
	addBtn: {
		backgroundColor: "#e53935",
		paddingHorizontal: 12,
		paddingVertical: 9,
		borderRadius: 10,
		flexDirection: "row",
		alignItems: "center",
	},
	addText: { color: "#fff", marginLeft: 6, fontWeight: "600" },
	tableHeader: {
		flexDirection: "row",
		paddingVertical: 10,
		borderBottomWidth: 1,
		borderBottomColor: "#eee",
		marginBottom: 6,
	},
	headerCell: { color: "#666", fontWeight: "600" },
	hRoom: { flex: 2 },
	hStatus: { flex: 1, textAlign: "center" },
	hAlerts: { flex: 0.8, textAlign: "center" },
	hCamera: { flex: 0.9, textAlign: "center" },
	hActions: { flex: 1, textAlign: "center" },
	row: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 12,
		borderBottomWidth: 1,
		borderBottomColor: "#fafafa",
	},
	colRoom: { flex: 2 },
	colStatus: { flex: 1, alignItems: "center" },
	colAlerts: { flex: 0.8, alignItems: "center" },
	colCamera: { flex: 0.9, alignItems: "center" },
	colActions: { flex: 1, flexDirection: "row", justifyContent: "center" },
	roomName: { fontSize: 15, fontWeight: "600", color: "#222" },
	roomMeta: { color: "#666", fontSize: 12, marginTop: 4 },
	badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
	safeBadge: { backgroundColor: "#111" },
	alertBadge: { backgroundColor: "#e53935" },
	badgeText: { color: "#fff", fontSize: 12, textTransform: "capitalize" },
	alertCount: { color: "#111", fontWeight: "700" },
	cameraToggle: {
		backgroundColor: "#f3f4f6",
		borderWidth: 1,
		borderColor: "#e5e7eb",
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 12,
	},
	cameraLabel: { color: "#111", fontWeight: "600" },
	iconBtn: { padding: 6 },
	empty: { textAlign: "center", marginTop: 20, color: "#777" },
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.3)",
		justifyContent: "center",
		alignItems: "center",
		padding: 16,
	},
	modalCard: {
		width: "100%",
		maxWidth: 420,
		backgroundColor: "#fff",
		borderRadius: 12,
		padding: 16,
	},
	modalTitle: { fontSize: 18, fontWeight: "700", color: "#111", marginBottom: 12 },
	input: {
		borderWidth: 1,
		borderColor: "#e5e7eb",
		borderRadius: 10,
		paddingHorizontal: 12,
		paddingVertical: 10,
		color: "#111",
		marginBottom: 10,
	},
	switchRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 14,
	},
	switchLabel: { color: "#111", fontWeight: "600" },
	modalActions: { flexDirection: "row", justifyContent: "flex-end" },
	cancelBtn: {
		paddingHorizontal: 12,
		paddingVertical: 10,
		borderRadius: 8,
		marginRight: 8,
		backgroundColor: "#f3f4f6",
	},
	cancelText: { color: "#111", fontWeight: "600" },
	saveBtn: {
		paddingHorizontal: 12,
		paddingVertical: 10,
		borderRadius: 8,
		backgroundColor: "#e53935",
	},
	saveText: { color: "#fff", fontWeight: "600" },
});