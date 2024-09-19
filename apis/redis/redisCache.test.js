const {
	CacheAddUser,
	CacheRemoveUser,
	CacheGetUserXP,
	CacheSetUserXP,
	closeRedisConnection,
	initializeRedis
} = require('./redisCache');


describe('Redis Cache Functionality', () => {

	beforeAll(async () => {
		// Connect to Redis before running tests
		await initializeRedis();
	});

	afterAll(async () => {
		// Flush Redis database to clear all data after tests
		await closeRedisConnection(); // Close the Redis connection
	});

	beforeEach(async () => {
		// Optionally reset mocks and flush Redis before each test if needed
	});

	test('CacheAddUser initializes a new user with 0 XP', async () => {
		const userId = 'newUser';
		await CacheAddUser(userId);
		const xp = await CacheGetUserXP(userId);
		expect(xp).toBe(0);
	});

	test('CacheSetUserXP and CacheGetUserXP update and retrieve XP correctly', async () => {
		const userId = 'testUser';
		await CacheSetUserXP(userId, 150);
		const xp = await CacheGetUserXP(userId);
		expect(xp).toBe(150);
	});

	test('CacheRemoveUser removes a user from the cache', async () => {
		const userId = 'removeUser';
		await CacheSetUserXP(userId, 50); // Ensure the user exists in the cache
		await CacheRemoveUser(userId);
		await expect(CacheGetUserXP(userId)).rejects.toThrow('no user with id: removeUser in cache');
	});

});

