const express = require("express");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const dbPath = path.join(__dirname, "twitterClone.db");

const app = express();
app.use(express.json());
let db = null;

const init = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("server is running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error :${e.message}`);
    process.exit(1);
  }
};
init();

const getFollowingPeopleIdsOfUser = async (username) => {
  const getTheFollowingPeopleQuery = `
    SELECT following_user_id FROM follower INNER JOIN user ON user.user_id = follower.follower_user_id 
    WHERE user.username = '${username}';`;
  const followingPeople = await db.all(getTheFollowingPeopleQuery);
  const arrayOfIds = followingPeople.map(
    (eachUser) => eachUser.following_user_id
  );
  return arrayOfIds;
};

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        request.userId = payload.userId;
        next();
      }
    });
  }
};

const tweetAccessVerification = async (request, response, next) => {
  const { userId } = request;
  const { tweetId } = request.params;
  const getTweetQuery = `
    SELECT * FROM tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id 
    WHERE tweet.tweet_id = '${tweetId}' AND follower_user_id = '${userId}';`;
  const tweet = await db.get(getTweetQuery);
  if (tweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};
///API-1

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username ="${username}"`;

  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      await db.run(
        `INSERT INTO user (username,password,name,gender) 
                VALUES ("${username}","${hashedPassword}","${name}","${gender}")`
      );
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

///API-2

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({
        jwtToken,
      });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

///API-3

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;

  const followingPeopleIds = await getFollowingPeopleIdsOfUser(username);

  const getTweetsFeedQuery = `
   SELECT 
       username,
       tweet,
       date_time AS dateTime 
   FROM  
       user INNER JOIN tweet ON user.user_id = tweet.user_id
   WHERE 
       user.user_id IN (${followingPeopleIds})
   ORDER BY 
       date_time DESC 
   LIMIT 4 
   ;`;
  const tweetFeedArray = await db.all(getTweetsFeedQuery);
  response.send(tweetFeedArray);
});
//API 4

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username, userId } = request;
  const userFollowersQuery = `
    SELECT 
        name
    FROM 
        follower INNER JOIN user ON user.user_id = follower.following_user_id
    WHERE 
        follower_user_id = '${userId}'
    ;`;
  const followingPeople = await db.all(userFollowersQuery);
  response.send(followingPeople);
});

//API 5

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username, userId } = request;
  const getFollowersQuery = `SELECT DISTINCT name FROM follower INNER JOIN user ON user.user_id = follower.follower_user_id 
    WHERE following_user_id = '${userId}';`;
  const followers = await db.all(getFollowersQuery);
  response.send(followers);
});

module.exports = app;
