jest.mock('firebase-admin'); // Ensure Firebase Admin SDK

jest.mock('../redis/redisCache.js', () => ({ // Mock Redis cache functions
	CacheAddUser: jest.fn().mockResolvedValue(),
	CacheRemoveUser: jest.fn().mockResolvedValue(),
	CacheSetUserXP: jest.fn().mockResolvedValue()
}));
const {
	DBAddUser,
	DBRemoveUser,
	DBUpdateXP
} = require('./querys');
const { CacheAddUser, CacheRemoveUser, CacheSetUserXP } = require('../redis/redisCache.js');
describe('Firebase DB Queries', () => {
	beforeEach(() => {
		// Reset mocks before each test if needed
		jest.clearAllMocks();
		const firebaseAdmin = require('firebase-admin');
		const mockRef = firebaseAdmin.database().ref();
		mockRef.set.mockClear();
		mockRef.once.mockClear();
		mockRef.remove.mockClear();
	});

	it('should add a user correctly', async () => {
		const user = { id: 'user1', displayName: 'Test User' };
		await DBAddUser(user);

		const firebaseAdmin = require('firebase-admin');
		expect(firebaseAdmin.database().ref).toHaveBeenCalledWith(`users/${user.id}`);
		expect(firebaseAdmin.database().ref().set).toHaveBeenCalledWith({
			username: user.displayName,
			XP: 0,
			role: "Poop",
		});
		expect(CacheAddUser).toHaveBeenCalledWith(user.id);
	});

	it('should remove a user correctly', async () => {
		const userId = 'user1';
		await DBRemoveUser({ id: userId });

		const firebaseAdmin = require('firebase-admin');
		expect(firebaseAdmin.database().ref).toHaveBeenCalledWith(`users/${userId}`);
		expect(firebaseAdmin.database().ref().remove).toHaveBeenCalled();
		expect( CacheRemoveUser ).toHaveBeenCalledWith(userId);
	});

	it('should update user XP correctly', async () => {
		const userId = 'user1';
		const xpChange = 50;
		const initialXP = 100;
		const firebaseAdmin = require('firebase-admin');
		firebaseAdmin.database().ref().once.mockImplementationOnce(() => Promise.resolve({
			val: () => ({ XP: initialXP }) // Mocked initial XP
		}));
		await DBUpdateXP(userId, xpChange);	  

		expect(firebaseAdmin.database().ref).toHaveBeenCalledWith(`users/${userId}`);
		expect( CacheSetUserXP ).toHaveBeenCalledWith( userId, initialXP + xpChange);
	});
	it('should cache all user XPs correctly', async () => {
		// Mock Firebase response for fetching users
		const firebaseAdmin = require('firebase-admin');
		const mockUsers = {
			user1: { XP: 100 },
			user2: { XP: 200 }
		};
		firebaseAdmin.database().ref().once.mockResolvedValue({
			val: () => mockUsers
		});

		// Execute the function to test
		const { CacheAllUserXP } = require('./querys');
		await CacheAllUserXP();

		// Check that CacheSetUserXP was called the correct number of times
		expect(CacheSetUserXP).toHaveBeenCalledTimes(Object.keys(mockUsers).length);

		// Validate CacheSetUserXP was called with correct parameters for each user
		Object.entries(mockUsers).forEach(([userId, userData]) => {
			expect(CacheSetUserXP).toHaveBeenCalledWith(userId, userData.XP);
		});
	});

});
