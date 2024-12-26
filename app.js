const express = require('express')
const path = require('path')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const app = express()
app.use(express.json())

let db = null
const initializeDBandServer = async () => {
  try {
    db = await open({
      filename: path.join(__dirname, 'twitterClone.db'),
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server is running on http://localhost:3000/')
    })
  } catch (error) {
    console.log(`DataBase error is ${error.message}`)
    process.exit(1)
  }
}
initializeDBandServer()

const authenticateToken = (request, response, next) => {
  let jwtToken

  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken !== undefined) {
    jwt.verify(jwtToken, 'MY_AUTH_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        request.userId = payload.userId
        next()
      }
    })
  } else {
    response.status(401)
    response.send('Invalid JWT Token')
  }
}

const isUserFollowing = async (request, response, next) => {
  const {username, userId} = request
  const {tweetId} = request.params
  const userFollowinglistQuery = `select following_user_id from follower where follower_user_id = ${userId};`
  const followinglist = await db.all(userFollowinglistQuery)
  const getUserIdofTweetId = `select user_id from tweet where tweet_id = ${tweetId};`
  const userIdofTweetId = await db.get(getUserIdofTweetId)

  let followingUserIds = []
  followinglist.map(each => followingUserIds.push(each.following_user_id))
  const userIdoftweet = userIdofTweetId.user_id
  const isUserIdInFollowingList = followingUserIds.includes(userIdoftweet)
  if (isUserIdInFollowingList === true) {
    request.tweetId = tweetId
    request.userId = userId
    next()
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
}

app.post('/register/', async (request, response) => {
  const userDetails = request.body
  const {username, password, name, gender} = userDetails
  const getUserDetailsQuery = `select * from user where username = '${username}';`
  const dbUser = await db.get(getUserDetailsQuery)
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hashedPassword = await bcrypt.hash(password, 10)
      const createUserQuery = `INSERT INTO user(username,password,name,gender) Values('${username}','${hashedPassword}','${name}','${gender}');`
      await db.run(createUserQuery)
      const checkUser = await db.get(getUserDetailsQuery)
      response.status(200)
      response.send('User created successfully')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

app.post('/login/', async (request, response) => {
  const userDetails = request.body
  const {username, password} = userDetails
  const getUserDetailsQuery = `select * from user where username = '${username}';`
  const dbUser = await db.get(getUserDetailsQuery)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordsMatched = await bcrypt.compare(password, dbUser.password)
    if (isPasswordsMatched === true) {
      const payload = {username: username, userId: dbUser.user_id}
      const jwtToken = jwt.sign(payload, 'MY_AUTH_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {username, userId} = request
  const getTweetListQuery = `select username,tweet,date_time as dateTime from follower join tweet on follower.following_user_id = tweet.user_id natural join user where follower.follower_user_id = ${userId} order by date_time DESC limit 4;`
  const tweets = await db.all(getTweetListQuery)
  response.send(tweets)
})

app.get('/user/following/', authenticateToken, async (request, response) => {
  const {username, userId} = request
  const getFollowingListQuery = `select distinct name from user join follower on user.user_id = follower.following_user_id where follower.follower_user_id = ${userId};`
  const followingList = await db.all(getFollowingListQuery)
  response.send(followingList)
})

app.get('user/followers/', authenticateToken, async (request, response) => {
  const {username, userId} = request
  const query = `
    SELECT name
    FROM follower INNER JOIN user
    ON follower.follower_user_id = user.user_id
    WHERE following_user_id = ${userId};`

  const data = await db.all(query)
  response.send(data)
})

app.get(
  '/tweets/:tweetId/',
  authenticateToken,
  isUserFollowing,
  async (request, response) => {
    const {tweetId, userId} = request
    const getTweetDetailsQuery = `select tweet, count(like_id) as likes, count(reply) as replies, date_time as dateTime from tweet natural join like natural join reply where tweet_id = ${tweetId};`
    const data = await db.get(getTweetDetailsQuery)
    response.send(data)
  },
)

app.get(
  '/tweets/:tweetId/likes',
  authenticateToken,
  isUserFollowing,
  async (request, response) => {
    const {tweetId} = request
    const getLikesForTweetQuery = `select username from user natural join like where tweet_id = ${tweetId};`
    const likedUsernames = await db.all(getLikesForTweetQuery)
    let likes = []
    likedUsernames.map(each => likes.push(each.username))
    response.send({likes})
  },
)

app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  isUserFollowing,
  async (request, response) => {
    const {tweetId} = request
    const getRepliesForTweetQuery = `select name,reply from user natural join reply where tweet_id = ${tweetId};`
    const replies = await db.all(getRepliesForTweetQuery)
    response.send({replies})
  },
)

app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const {username, userId} = request
  const getTweetsQuery = `
    SELECT tweet, COUNT() AS likes, count() as replies,date_time As dateTime
    FROM tweet INNER JOIN like
    ON tweet.tweet_id = like.tweet_id join
    reply
    ON tweet.tweet_id = reply.tweet_id
    WHERE tweet.user_id = ${userId}
    GROUP BY tweet.tweet_id;`
  const tweets = await db.all(getTweetsQuery)
  response.send(tweets)
  //   const {username, userId} = request
  //   // const getUserQuery = `
  //   //   // SELECT * FROM user WHERE username = '${username}';`;
  //   //   // const dbUser = await db.get(getUserQuery);
  //   //   // const userId = dbUser['user_id'];

  //   const query = `
  //     SELECT tweet, COUNT() AS likes, date_time As dateTime
  //     FROM tweet INNER JOIN like
  //     ON tweet.tweet_id = like.tweet_id
  //     WHERE tweet.user_id = ${userId}
  //     GROUP BY tweet.tweet_id;`
  //   let likesData = await db.all(query)

  //   const repliesQuery = `
  //     SELECT tweet, COUNT() AS replies
  //     FROM tweet INNER JOIN reply
  //     ON tweet.tweet_id = reply.tweet_id
  //     WHERE tweet.user_id = ${userId}
  //     GROUP BY tweet.tweet_id;`

  //   const repliesData = await db.all(repliesQuery)

  //   likesData.forEach(each => {
  //     for (let data of repliesData) {
  //       if (each.tweet === data.tweet) {
  //         each.replies = data.replies
  //         break
  //       }
  //     }
  //   })
  //   response.send(likesData)
})

app.post('/user/tweets/', authenticateToken, async (request, response) => {
  const {userId} = request
  const {tweet} = request.body

  const posttweetQuery = `insert into tweet(tweet,user_id) values ('${tweet}','${userId}');`
  await db.run(posttweetQuery)
  response.send('Created a Tweet')
})

app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    const {userId} = request
    const {tweetId} = request.params
    const getUserIdOfTweet = `select user_id from tweet where tweet_id = ${tweetId};`
    const tweetUser = await db.get(getUserIdOfTweet)
    const tweetUserId = tweetUser.user_id
    if (tweetUserId === userId) {
      const deleteTweetQuery = `delete from tweet where tweet_id = ${tweetId};`
      await db.run(deleteTweetQuery)
      response.send('Tweet Removed')
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

module.exports = app
