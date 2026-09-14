import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let studyRatelimit;

const getStudyRatelimit = () => {
  if (!studyRatelimit) {
    studyRatelimit = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(10, "10 m"),
      prefix: "thinkboard:study",
    });
  }

  return studyRatelimit;
};

const studyRateLimiter = async (req, res, next) => {
  try {
    const identifier = req.ip || req.socket.remoteAddress || "unknown";
    const { success } = await getStudyRatelimit().limit(identifier);

    if (!success) {
      return res.status(429).json({
        message: "You've reached the study-helper limit. Please try again in a few minutes.",
      });
    }

    next();
  } catch (error) {
    console.error("Study helper rate limit failed", error.message);
    next(error);
  }
};

export default studyRateLimiter;
