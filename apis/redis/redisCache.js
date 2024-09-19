// Import the Redis client
const redis = require("redis");
// Client will be set in the initializeRedis function
let client;
let isInitialConnection = true;
const {
  InfanticideCooldown,
  FesterCooldown,
  FesteringDuration,
  SwarmCooldown,
} = require("../../game_config.json");

// Initialize Redis connection

function showErrorMsg(err) {
  console.error("ERROR: redisCache.js", err);
}

async function initializeRedis() {
  client = redis.createClient();
  client.on("connect", async () => {
    if (!isInitialConnection) {
      console.log("Redis reconnected, synchronizing cache...");
      try {
        await CacheAllUserXP();
        console.log("Redis cache re-synchronized successfully.");
      } catch (error) {
        console.error("Failed to synchronize Redis cache on reconnect:", error);
      }
    }
    isInitialConnection = false;
  });
  client.on("reconnecting", () => console.log("Redis Client Reconnecting"));
  client.on("error", (err) => {
    console.error("Redis Client Error", err);
    throw err;
  });
  try {
    await client.connect();
    await client.flushDb();
    console.log("Redis client connected, flushed cache");
  } catch (err) {
    console.error(err);
    throw err;
  }
}

async function CacheAddUser(userId) {
  try {
    await CacheSetUserXP(userId, 0);
    console.log(`Cache: succesfully cached new user ID: ${userId}`);
  } catch (err) {
    console.error(
      `Cache: error caching new user ID: ${userId} with error : ${err}`
    );
    throw err;
  }
}

async function CacheRemoveUser(userId) {
  try {
    await client.del(`user:${userId}:xp`);
    console.log(`Cache: succesfully remved user from cache ID: ${userId}`);
  } catch (err) {
    console.error(
      `Cache: Error removing user from cache ID: ${userId} with error : ${err}`
    );
    throw err;
  }
}

// Setting a user's XP
async function CacheSetUserXP(userId, xp) {
  try {
    await client.set(`user:${userId}:xp`, xp.toString());
  } catch (err) {
    throw err;
  }
  console.log(`Cache: succesfully cached XP: ${xp} for user ID : ${userId}`);
}

// Getting a user's XP
async function CacheGetUserXP(userId) {
  const xp = await client.get(`user:${userId}:xp`);
  if (!xp) {
    throw new Error(`no user with id: ${userId} in cache`);
  }
  return xp;
}

async function CacheSetFestering(maggotId, poopId, endTime) {
  try {
    await client.set(`festering:${maggotId}`, poopId);
    const startTime = endTime - FesteringDuration;
    await CacheSetFesterCooldown(maggotId, startTime);
  } catch (err) {
    throw err;
  }
}

async function CacheClearFestering(maggotId) {
  try {
    await client.del(`festering:${maggotId}`);
  } catch (err) {
    throw err;
  }
}

async function CacheGetFesteringTarget(maggotId) {
  try {
    const festeringData = await client.get(`festering:${maggotId}`);
    return festeringData ? festeringData : null;
  } catch (err) {
    throw err;
  }
}

// Function to close the Redis connection
async function closeRedisConnection() {
  if (client) {
    try {
      await client.flushDb();
      await client.quit();
    } catch (err) {
      console.error(`Cache: couldn't close redis connection error: ${err}`);
      throw err;
    }
  } else {
    console.error("Cache: no redis client connection to close");
  }
}

async function CacheSetSwarmCooldown(startTime) {
  const cooldownEndTime = startTime + SwarmCooldown;
  const cooldownTimeLeft = cooldownEndTime - Date.now();
  if (cooldownTimeLeft > 0) {
    try {
      await client.set(`swarmCooldown`, cooldownEndTime);
    } catch (err) {
      throw err;
    }
  }
  setTimeout(async () => {
    await CacheClearSwarmCooldown();
  }, cooldownTimeLeft);
}

async function CacheClearSwarmCooldown() {
  try {
    await client.del(`swarmCooldown`);
  } catch (err) {
    throw err;
  }
}

async function CacheGetSwarmCooldown() {
  try {
    const cooldown = await client.get(`swarmCooldown`);
    return cooldown ? cooldown : false;
  } catch (err) {
    throw err;
  }
}

// I will remove _(underline) after you check.
async function CacheSetCooldown(cacheKey, userId, cooldownTime) {
	const cooldownEndTime = Date.now() + cooldownTime;
	const cooldownTimeLeft = cooldownEndTime - Date.now();
	console.log("cooldownTimeLeft---------->",cooldownTimeLeft)
	if(userId){
	try {
		if (cooldownTimeLeft > 0) {
			console.log("GlobalCooldown set is running")
			await client.set(`${cacheKey}Cooldown:${userId}`, cooldownTimeLeft);
		}
		setTimeout(async () => {
			await CacheClearCooldown(cacheKey, userId);
		}, cooldownTimeLeft);
	} catch (err) {
		showErrorMsg(err);
	}
	}else{
	try {
		if (cooldownTimeLeft > 0) {
			await client.set(`${cacheKey}Cooldown`, cooldownTimeLeft);
		}
		setTimeout(async () => {
			await CacheClearCooldown(cacheKey);
		}, cooldownTimeLeft);
	} catch (err) {
		showErrorMsg(err);
	}
	}	
}

async function CacheClearCooldown(cacheKey, userId) {
  if (userId) {
    try {
      await client.del(`${cacheKey}Cooldown:${userId}`);
    } catch (err) {
      showErrorMsg(err);
    }
  } else {
    try {
      await client.del(`${cacheKey}Cooldown`);
    } catch (err) {
      showErrorMsg(err);
    }
  }
}

async function CacheGetCooldown(cacheKey, userId) {
  if (userId) {
    try {
      const cooldown = await client.get(`${cacheKey}Cooldown:${userId}`);
      console.log("cooldown value---------->", cooldown);
      if (cooldown) {
        return cooldown;
      } else {
        return false;
      }
    } catch (err) {
      showErrorMsg(err);
    }
  } else {
    try {
      const cooldown = await client.get(`${cacheKey}Cooldown`);
      if (cooldown) {
        return cooldown;
      } else {
        return false;
      }
    } catch (err) {
      showErrorMsg(err);
    }
  }
}

/*async function CacheSetCooldown(cockroachId, startTime) {
	const cooldownEndTime = startTime + InfanticideCooldown;
	const cooldownTimeLeft = cooldownEndTime - Date.now();
	if (cooldownTimeLeft > 0) {
		try {
			await client.set(`infanticideCooldown:${cockroachId}`, cooldownEndTime);
		} catch (err) {
			throw err;
		}
	}
	setTimeout(async () => {
		await CacheClearInfanticideCooldown(cockroachId);
	}, cooldownTimeLeft);
}

async function CacheClearInfanticideCooldown(cockroachId) {
	try {
		await client.del(`infanticideCooldown:${cockroachId}`);
	} catch (err) {
		throw err;
	}
}

async function CacheGetCooldown(cockroachId) {
	try {
		const cooldown = await client.get(`infanticideCooldown:${cockroachId}`);
		if (cooldown) {
			return cooldown;
		} else {
			return false;
		}
	} catch (err) {
		throw err;
	}
}*/

async function CacheSetFesterCooldown(maggotId, startTime) {
  const cooldownEndTime = startTime + FesterCooldown;
  const cooldownTimeLeft = cooldownEndTime - Date.now();
  if (cooldownTimeLeft > 0) {
    try {
      await client.set(`festerCooldown:${maggotId}`, cooldownEndTime);
    } catch (err) {
      throw err;
    }
  }
  setTimeout(async () => {
    await CacheClearFesterCooldown(maggotId);
  }, cooldownTimeLeft);
}

async function CacheClearFesterCooldown(maggotId) {
  try {
    await client.del(`festerCooldown:${maggotId}`);
  } catch (err) {
    throw err;
  }
}

async function CacheGetFesterCooldown(maggotId) {
  try {
    const cooldown = await client.get(`festerCooldown:${maggotId}`);
    if (cooldown) {
      return cooldown;
    } else {
      return false;
    }
  } catch (err) {
    throw err;
  }
}

async function CacheIsPoopBeingFestered(poopId) {
  try {
    const keys = await client.keys("festering:*");
    for (let key of keys) {
      const festeringData = await client.get(key);
      if (festeringData === poopId) {
        const maggotId = key.split(":")[1];
        console.log(`maggot targeting poop is ${maggotId}`);
        return maggotId;
      }
    }
    return false;
  } catch (err) {
    showErrorMsg(err);
    return true;
  }
}

module.exports = {
  initializeRedis,
  CacheRemoveUser,
  CacheAddUser,
  CacheGetUserXP,
  CacheSetUserXP,
  CacheSetFestering,
  CacheClearFestering,
  CacheGetFesteringTarget,
  CacheIsPoopBeingFestered,
  CacheSetFesterCooldown,
  CacheGetFesterCooldown,
  CacheClearFesterCooldown,
  closeRedisConnection,
  CacheSetCooldown,
  CacheGetCooldown,
  CacheClearCooldown,
  CacheGetSwarmCooldown,
  CacheSetSwarmCooldown,
  CacheClearSwarmCooldown,
};
