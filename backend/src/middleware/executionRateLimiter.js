import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const executionRateLimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, "60 s"),
  prefix: "thinkboard:code-execution",
});

const executionRateLimiter = async (req, res, next) => {
  try {
    const { success } = await executionRateLimit.limit(req.ip);

    if (!success) {
      return res.status(429).json({
        message: "Too many code runs. Please wait a minute and try again.",
      });
    }

    next();
  } catch (error) {
    console.error("Code execution rate limit error", error);
    res.status(503).json({
      message: "Code execution is temporarily unavailable.",
    });
  }
};

export default executionRateLimiter;
