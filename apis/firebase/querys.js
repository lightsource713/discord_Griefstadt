const { db } = require('./firebaseDb.js');
const { roleXpThresholds, FesteringDuration } = require('../../game_config.json');
const { CacheRemoveUser, CacheAddUser, CacheSetUserXP, CacheSetFestering, CacheClearFestering, CacheIsPoopBeingFestered} = require('../redis/redisCache.js');
const { eventEmitter } = require('../../functions/eventEmitter.js');

async function CacheDataFromDB() {
    try {
        await CacheAllUserXP();
        await CacheFesteringUsers();
    } catch (err) {
        console.log(`Cache: error caching DB data on startup error message: ${err}`);
    }
}

async function CacheAllUserXP() {
    try {
        const users = await DBGetUsers();
        for (const userId in users) {
            const xp = users[userId].XP || 0;
            await CacheSetUserXP(userId, xp);
        }
        console.log('Cache: succesfully cached all users XP');
    } catch (err) {
        console.error(`Cache: ${err}`);
        throw err;
    }
}

async function CacheFesteringUsers() {
    const festerings = await DBGetActiveFestering();
    if (!festerings) {
        throw new Error(`DB: couldn't get list of active festering on start-up`);
    }
    const now = Date.now();
    for (const maggotId in festerings) {
        const data = festerings[maggotId];
        console.log(`Cahing festering maggotId: ${maggotId}   poopId: ${data.poopId} endTime: ${data.endTime}`);
        try {
            if (data.endTime > now) {
                await CacheSetFestering(maggotId, data.poopId, data.endTime);
            } else {
                await DBClearFestering(maggotId);
            }
        } catch (err) {
            throw err;
        }
    }
}

async function DBGetUsers() {
    const snapshot = await db.ref('users').once('value');
    if (!snapshot) {
        console.error('DB: unable to fetch users');
        throw new Error(`DB: unable to fetch users`);
    }
    return snapshot.val(); // users
}

async function DBGetUserById(userId) {
    const userRef = db.ref(`users/${userId}`)
    const userDataSnapshot = await userRef.once('value');
    if (!userDataSnapshot) {
        console.error(`User ID: ${userId} not found`);
        return false;
    }
    return userDataSnapshot.val();
}

async function DBAddUser(member) {
    try {
        await db.ref('users/' + member.id).set({
            username: member.displayName,
            XP: 0,
            role: "Poop",
        });
        console.log(`DB: User ${member.displayName} added to DB. updating cache..`);
        await CacheAddUser(member.id);
    } catch (err) {
        console.error(err);
        throw err;
    }
}

async function DBRemoveUser(member) {
    try {
        await db.ref(`users/${member.id}`).remove();
        console.log(`DB: User ${member.displayName} removed from DB. updating cache..`);
        await CacheRemoveUser(member.id);
    } catch (err) {
        console.error(err);
        throw err;
    }
}

async function DBUpdateXP(userId, xpChange, client) {
    const userRef = db.ref(`users/${userId}`)
    const userXpRef = db.ref(`users/${userId}/XP`);
    const userDataSnapshot = await userRef.once('value');
    if (!userDataSnapshot) {
        throw new Error(`User ID: ${userId} not found`)
    }
    const userData = userDataSnapshot.val();
    if (!userData) {
        throw new Error(`User ID :${userId} not found`);
    }
    try {
        const festering = await CacheIsPoopBeingFestered(userId);
        if (festering && (xpChange > 0)) {
            const maggotXP = Math.floor(xpChange / 2);
            xpChange = maggotXP;
            await DBUpdateXP(festering, maggotXP, client);
        }
    } catch (err) {
        throw err;
    }
    if ((parseInt(userData.XP) + parseInt(xpChange)) < 0) {
        throw new Error(`User with id ${userId} does not have enough XP for xp change`);
    }
    let newXP = (userData.XP || 0) + xpChange;
    let newRole = userData.role;
    let remainderXP = newXP;
    // Determine if a role upgrade is needed
    const roles = Object.keys(roleXpThresholds);
    for (let i = 0; i < roles.length; i++) {
        if (newRole === roles[i] && newXP >= roleXpThresholds[roles[i]]) {
            // Check if there's a next role``
            if (i + 1 < roles.length) {
                newRole = roles[i + 1];
                remainderXP = newXP - roleXpThresholds[roles[i]]; // Calculate remainder XP
                newXP = remainderXP; // Reset XP to remainder
            }
            if (remainderXP < roleXpThresholds[roles[i + 1]]) break;
        }
    }

    // Update user's XP and role
    try {
        await userXpRef.set(newXP);
        await CacheSetUserXP(userId, newXP);
    } catch (err) {
        console.error(`failed to update XP for user with id: ${userId} err : ${err.message}`)
        throw err;
    }

    // If role changed, you might want to do additional actions here, like announcing the role change
    if (newRole !== userData.role) {
	try{	
		console.log(`role update event triggerred for ${userId} with role ${newRole}`)
		eventEmitter.emit('changeRole', userId, newRole );
    		console.log(`Event emitted for role update for user with ID:${userId}`);
	}catch(err){
		console.error(`failed to emmit role update event for user with ID: ${userId}`);
		throw err;
	}	
    }
}

async function DBResetXP(userId) {
    const xpResetPath = `users/${userId}/XP`;
    try {
        let ref = db.ref(xpResetPath);
        await ref.set(0);
        console.log(`Database: XP reset to 0 for user ${userId}.`);
        await CacheSetUserXP(userId, 0);
    } catch (error) {
        console.error(`Error resetting XP for user ${userId}: ${error.message}`);
        throw error;
    }
}

function DBSetRole(member, newRole) {
    const userRoleRef = db.ref(`users/${member.id}/role`);

    userRoleRef.set(newRole)
        .then(() => console.log(`DB: Role ${newRole} set for user ${member.displayName}.`))
        .catch(err => console.error(err));
}

// Example function to get the last XP boost time from the database
async function DBGetLastXPBoostTime() {
    try {
        const ref_time_since_boost = db.ref('LastXpBoost');
        const time_since_boost = await ref_time_since_boost.once('value');
        console.log(`DB: checked time since last XP boost: ${time_since_boost.val()}`);
        if (!time_since_boost.val()) {
            return null;
        }
        return time_since_boost.val();
    } catch (err) {
        throw ({name: 'DBError', message: `Error getting last XP boost time: ${err.message}`})
    }
}

async function DBSetLastXPBoostTime(time) {
    try {
        let ref = db.ref('LastXpBoost')
        await ref.set(time);
        console.log(`DB: Last XP boost time set to ${time}`);

    } catch (err) {
        throw ({name: 'DBError', message: `Error setting last XP boost time: ${err.message}`})
    }
}

async function DBBoostXPForAllUsers(xpBoost, client) {
    let snapshot;
    try {
        const usersRef = db.ref('users');
        snapshot = await usersRef.once('value');
    } catch (err) {
        console.error(`Error fetching users: ${err.message}`);
        throw new Error(`Error fetching users: ${err.message}`);
    }

    const users = snapshot.val();
    if (!users) {
        console.error('No users found for XP boost.');
        return; // Exit if no users found
    }

    let usersToUpdate = Object.keys(users); // List of user IDs to update
    console.log(`User list : ${usersToUpdate}`)
    let retryCount = 0;
    while (usersToUpdate.length > 0 && retryCount < 3) {
        console.log(`Attempt ${retryCount + 1}: Boosting XP for ${usersToUpdate.length} users.`);
        let retryUsers = [];

        for (const userId of usersToUpdate) {
            try {
                await DBUpdateXP(userId, xpBoost, client);
                console.log(`XP boosted for user ${userId}.`);
            } catch (err) {
                console.error(`Failed to boost XP for user ${userId}: ${err.message}`);
                retryUsers.push(userId); // Add user ID to retry list
            }
        }

        // Prepare for the next retry iteration with users that failed to update
        usersToUpdate = retryUsers;
        retryCount++;
    }

    if (usersToUpdate.length > 0) {
        console.error(`Failed to boost XP for ${usersToUpdate.length} users after 3 attempts, all others updated.`);
    } else {
        console.log('XP boosted for all users successfully.');
        await DBSetLastXPBoostTime(Date.now());
    }
}

async function DBSetFestering(maggotId, poopId) {
    const now = Date.now();
    const endTime = now + FesteringDuration;
    console.log(`Setting fester for maggot ${maggotId} and poop ${poopId}...`);
    try {
        await db.ref(`festering/${maggotId}`).set({
            poopId: poopId,
            startTime: now,
            endTime: endTime,  // FESTERING_DURATION should be defined based on your game rules
        });
    } catch (err) {
        console.error(`DB: Failed to set festering for maggot ${maggotId} and poop ${poopId}: ${err.message}`);
        // throw err;
    }
    try {
        await CacheSetFestering(maggotId, poopId, endTime);
    } catch (err) {
        console.error(`Cache: Failed to set festering for maggot ${maggotId} and poop ${poopId} :${err.message}`);
        // throw err;
    }
    const timeLeft = endTime - Date.now();
    setTimeout(async () => {
        try {
            console.log(`deleting festering between maggot : ${maggotId} and poop : ${poopId} ...`)
            await DBClearFestering(maggotId);
            await CacheClearFestering(maggotId);
        } catch (err) {
            throw err;
        }
    }, timeLeft);
}

async function DBClearFestering(maggotId) {
    try {
        await db.ref(`festering/${maggotId}`).remove();
    } catch (err) {
        console.error(`DB: Failed to clear festering for maggot ${maggotId} ${err.message}`);
        throw err;
    }
    try {
        await CacheClearFestering(maggotId);
    } catch (err) {
        console.error(`Cache: Failed to set festering for maggot ${maggotId} ${err.message}`);
        throw err;
    }
    eventEmitter.emit('festeringStatusChanged');
}

async function DBGetFestering(maggotId) {
    const snapshot = await db.ref(`festering/${maggotId}`).once('value');
    return snapshot.val();
}

async function DBGetActiveFestering() {
    const snapshot = await db.ref(`festering`).once('value');
    return snapshot.val() || {};
}

module.exports = { CacheDataFromDB, CacheAllUserXP, CacheFesteringUsers , DBGetUsers, DBGetUserById, DBAddUser, DBRemoveUser, DBUpdateXP, DBSetRole, DBGetLastXPBoostTime, DBSetLastXPBoostTime, DBBoostXPForAllUsers, DBResetXP, DBSetFestering, DBGetActiveFestering, DBClearFestering, DBGetFestering };