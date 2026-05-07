import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
	View,
	Text,
	StyleSheet,
	TouchableOpacity,
	SafeAreaView,
	StatusBar,
	ActivityIndicator,
	TextInput,
	FlatList,
	Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';

const MOCK_USERS = [
	{ id: 1, name: 'Alice Brown', email: 'alice@example.com', role: 'user', status: 'inactive', created: '2026-01-05' },
	{ id: 2, name: 'Bob Wilson', email: 'bob@example.com', role: 'user', status: 'active', created: '2026-03-10' },
	{ id: 3, name: 'Charlie Davis', email: 'charlie@example.com', role: 'user', status: 'active', created: '2026-04-12' },
	{ id: 4, name: 'Jane Smith', email: 'jane@example.com', role: 'user', status: 'active', created: '2026-02-20' },
	{ id: 5, name: 'John Doe', email: 'john@example.com', role: 'admin', status: 'active', created: '2026-01-15' },
];

const compareByNameAndDate = (left, right) => {
	const nameResult = left.name.localeCompare(right.name);
	if (nameResult !== 0) {
		return nameResult;
	}

	return new Date(left.created).getTime() - new Date(right.created).getTime();
};

export default function AdminUserScreen() {
	const { user } = useApp();
	const [users, setUsers] = useState([...MOCK_USERS].sort(compareByNameAndDate));
	const [loading, setLoading] = useState(false);
	const [search, setSearch] = useState('');
	const [sortBy, setSortBy] = useState('name');
	const [showSortMenu, setShowSortMenu] = useState(false);
	const [refreshing, setRefreshing] = useState(false);

	const totalUsers = users.length;
	const totalRooms = 6; // placeholder matching screenshot
	const totalSensors = 24;
	const totalAlerts = 47;

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		const res = users.filter((u) =>
			`${u.name} ${u.email}`.toLowerCase().includes(q),
		);
		return [...res].sort((left, right) => {
			if (sortBy === 'created') {
				return new Date(left.created).getTime() - new Date(right.created).getTime();
			}

			const nameResult = left.name.localeCompare(right.name);
			if (nameResult !== 0) {
				return nameResult;
			}

			return new Date(left.created).getTime() - new Date(right.created).getTime();
		});
	}, [users, search, sortBy]);

	const sortLabel = useMemo(() => {
		if (sortBy === 'created') return 'Sort by Date';
		return 'Sort by Name';
	}, [sortBy]);

	const onRefresh = useCallback(() => {
		setRefreshing(true);
		setUsers([...MOCK_USERS].sort(compareByNameAndDate));
		setTimeout(() => setRefreshing(false), 300);
	}, []);

	const handleDeleteUser = useCallback((userId, userName) => {
		Alert.alert(
			'Delete User',
			`Delete ${userName}? This action cannot be undone.`,
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Delete',
					style: 'destructive',
					onPress: () => {
						setUsers((currentUsers) => currentUsers.filter((entry) => entry.id !== userId));
					},
				},
			],
		);
	}, []);

	const renderBadge = (text, kind) => (
		<View
			style={[
				styles.badge,
				kind === 'role' ? styles.roleBadge : styles.statusBadge,
			]}
		>
			<Text numberOfLines={1} ellipsizeMode="clip" style={styles.badgeText}>
				{text}
			</Text>
		</View>
	);

	const renderItem = ({ item }) => (
		<View style={styles.row}>
			<View style={styles.colLarge}>
				<Text style={styles.nameText}>{item.name}</Text>
				<Text style={styles.emailText}>{item.email}</Text>
			</View>

			<View style={styles.colSmall}>{renderBadge(item.role, 'role')}</View>
			<View style={styles.colSmall}>{renderBadge(item.status, 'status')}</View>
			<View style={styles.colMedium}>
				<Text style={styles.createdText}>{item.created}</Text>
			</View>
			<View style={styles.colAction}>
				<View style={styles.actionButtons}>
					<TouchableOpacity style={styles.actionBtn} onPress={() => {}}>
						<Ionicons name="create-outline" size={18} color="#333" />
					</TouchableOpacity>
					<TouchableOpacity
						style={styles.actionBtn}
						onPress={() => handleDeleteUser(item.id, item.name)}
					>
						<Ionicons name="trash-outline" size={18} color="#e53935" />
					</TouchableOpacity>
				</View>
			</View>
		</View>
	);

	return (
		<SafeAreaView style={styles.container}>
			<StatusBar barStyle="light-content" />
			<View style={styles.headerTop}>
				<Text style={styles.headerTitle}>Welcome, Admin</Text>
				<View style={styles.statsRow}>
					<View style={styles.statCard}>
						<Text style={styles.statNumber}>{totalUsers}</Text>
						<Text style={styles.statLabel}>Total Users</Text>
					</View>
					<View style={styles.statCard}>
						<Text style={styles.statNumber}>{totalRooms}</Text>
						<Text style={styles.statLabel}>Rooms</Text>
					</View>
					<View style={styles.statCard}>
						<Text style={styles.statNumber}>{totalSensors}</Text>
						<Text style={styles.statLabel}>Sensors</Text>
					</View>
					<View style={styles.statCard}>
						<Text style={styles.statNumber}>{totalAlerts}</Text>
						<Text style={styles.statLabel}>Alerts</Text>
					</View>
				</View>
			</View>

			<View style={styles.content}>
				<View style={styles.toolbar}>
					<View style={styles.searchBox}>
						<Ionicons name="search" size={18} color="#777" />
						<TextInput
							placeholder="Search users by name or email..."
							placeholderTextColor="#999"
							value={search}
							onChangeText={setSearch}
							style={styles.searchInput}
						/>
					</View>

					<View style={styles.rightControls}>
						<TouchableOpacity
							style={styles.sortBtn}
							onPress={() => setShowSortMenu((open) => !open)}
						>
							<Text numberOfLines={1} style={styles.sortText}>{sortLabel}</Text>
							<Ionicons name={showSortMenu ? 'chevron-up' : 'chevron-down'} size={18} color="#222" />
						</TouchableOpacity>

						{showSortMenu ? (
							<View style={styles.sortMenu}>
								<TouchableOpacity
									style={styles.sortOption}
									onPress={() => {
										setSortBy('name');
										setShowSortMenu(false);
									}}
								>
									<Text style={styles.sortOptionText}>Sort by Name</Text>
									{sortBy === 'name' ? <Ionicons name="checkmark" size={18} color="#111" /> : null}
								</TouchableOpacity>
								<TouchableOpacity
									style={styles.sortOption}
									onPress={() => {
										setSortBy('created');
										setShowSortMenu(false);
									}}
								>
									<Text style={styles.sortOptionText}>Sort by Date</Text>
									{sortBy === 'created' ? <Ionicons name="checkmark" size={18} color="#111" /> : null}
								</TouchableOpacity>
							</View>
						) : null}

						<TouchableOpacity style={styles.addBtn} onPress={() => {}}>
							<Ionicons name="add" size={18} color="#fff" />
							<Text style={styles.addText}>Add User</Text>
						</TouchableOpacity>
					</View>
				</View>

				<View style={styles.tableHeader}>
					<Text style={[styles.headerCell, styles.nameCell]}>Name</Text>
					<Text style={[styles.headerCell, styles.roleCell]}>Role</Text>
					<Text style={[styles.headerCell, styles.statusCell]}>Status</Text>
					<Text style={[styles.headerCell, styles.createdCell]}>Created</Text>
					<Text numberOfLines={1} style={[styles.headerCell, styles.actionCell]}>Actions</Text>
				</View>

				{loading ? (
					<ActivityIndicator size="large" />
				) : (
					<FlatList
						data={filtered}
						keyExtractor={(i) => String(i.id)}
						renderItem={renderItem}
						refreshing={refreshing}
						onRefresh={onRefresh}
						ListEmptyComponent={<Text style={styles.empty}>No users found.</Text>}
					/>
				)}
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	container: { 
		flex: 1, 
		backgroundColor: '#fff' 
	},
	headerTop: { 
		backgroundColor: '#e53935', 
		paddingVertical: 18, 
		paddingHorizontal: 14 
	},
	headerTitle: { 
		color: '#fff', 
		fontSize: 20, 
		fontWeight: '600', 
		marginBottom: 12 
	},
	statsRow: { 
		flexDirection: 'row', 
		justifyContent: 'space-between' 
	},
	statCard: { 
		flex: 1, 
		marginHorizontal: 4, 
		backgroundColor: 'rgba(255,255,255,0.14)', 
		padding: 16, 
		borderRadius: 8, 
		alignItems: 'center' 
	},
	statNumber: { 
		color: '#fff', 
		fontSize: 20, 
		fontWeight: '700' 
	},
	statLabel: { 
		color: '#fff', 
		fontSize: 12, 
		marginTop: 4 
	},
	content: { 
		flex: 1, 
		padding: 12 
	},
	toolbar: { 
		flexDirection: 'row', 
		alignItems: 'center', 
		marginBottom: 12 
	},
	searchBox: { 
		flex: 1, 
		flexDirection: 'row', 
		alignItems: 'center', 
		backgroundColor: '#f2f2f2', 
		padding: 8, 
		borderRadius: 8, 
		paddingHorizontal: 12 
	},
	searchInput: { 
		marginLeft: 8, 
		flex: 1, 
		color: '#222' 
	},
	rightControls: { 
		flexDirection: 'row', 
		alignItems: 'center', 
		marginLeft: 8, 
		position: 'relative' 
	},
	sortBtn: { 
		backgroundColor: '#f3f4f6', 
		borderWidth: 1, 
		borderColor: '#e5e7eb', 
		paddingHorizontal: 12, 
		paddingVertical: 10, 
		borderRadius: 10, 
		marginRight: 8, 
		flexDirection: 'row', 
		alignItems: 'center', 
		minWidth: 140, 
		justifyContent: 'space-between' 
	},
	sortText: { 
		color: '#111827', 
		marginRight: 6, 
		fontWeight: '600' 
	},
	sortMenu: {
		position: 'absolute',
		top: 46,
		left: 0,
		backgroundColor: '#fff',
		borderRadius: 10,
		borderWidth: 1,
		borderColor: '#e5e7eb',
		minWidth: 170,
		zIndex: 20,
		elevation: 5,
		shadowColor: '#000',
		shadowOpacity: 0.12,
		shadowRadius: 8,
		shadowOffset: { width: 0, height: 4 },
	},
	sortOption: {
		paddingVertical: 10,
		paddingHorizontal: 12,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
	sortOptionText: { 
		color: '#111827', 
		fontSize: 15 
	},
	addBtn: { 
		backgroundColor: '#e53935', 
		paddingHorizontal: 12, 
		paddingVertical: 8, 
		borderRadius: 8, 
		flexDirection: 'row', 
		alignItems: 'center' 
	},
	addText: { 
		color: '#fff', 
		marginLeft: 6 
	},
	tableHeader: { 
		flexDirection: 'row', 
		paddingVertical: 10, 
		borderBottomWidth: 1, 
		borderBottomColor: '#eee', 
		marginBottom: 6 
	},
	headerCell: { 
		color: '#666', 
		fontWeight: '600' 
	},
	nameCell: { 
		flex: 2 
	},
	roleCell: { 
		flex: 0.8, 
		textAlign: 'center' 
	},
	statusCell: { 
		flex: 0.8, 
		textAlign: 'center' 
	},
	createdCell: { 
		flex: 1, 
		textAlign: 'left' 
	},
	actionCell: { 
		flex: 0.85, 
		textAlign: 'center', 
		flexShrink: 0 
	},
	row: { 
		flexDirection: 'row', 
		alignItems: 'center', 
		paddingVertical: 12, 
		borderBottomWidth: 1, 
		borderBottomColor: '#fafafa' 
	},
	colLarge: { 
		flex: 2 
	},
	colSmall: { 
		flex: 0.8, 
		alignItems: 'center' 
	},
	colMedium: { 
		flex: 1
 	},
	colAction: { 
		flex: 0.85, 
		alignItems: 'center' 
	},
	nameText: { 
		fontSize: 15, 
		fontWeight: '600', 
		color: '#222' 
	},
	emailText: { 
		color: '#666', 
		fontSize: 12, 
		marginTop: 4 
	},
	createdText: { 
		color: '#666' 
	},
	actionButtons: { 
		flexDirection: 'row', 
		alignItems: 'center', 
		gap: 6 
	},
	actionBtn: { 
		padding: 6 
	},
	badge: { 
		paddingHorizontal: 8, 
		paddingVertical: 4, 
		borderRadius: 12 
	},
	roleBadge: { 
		backgroundColor: '#111' 
	},
	statusBadge: { 
		backgroundColor: '#111' 
	},
	badgeText: { 
		color: '#fff', 
		fontSize: 12, 
		flexShrink: 0 
	},
	empty: { 
		textAlign: 'center', 
		marginTop: 20, 
		color: '#777' 
	},
});
