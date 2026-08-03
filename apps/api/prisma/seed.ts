import { prisma } from "../src/lib/prisma.js";
import { registerUser } from "../src/services/auth.service.js";

const DEMO_EMAIL = "demo@resitku.test";
const DEMO_PASSWORD = "demo-password-123";

async function main(): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { email: DEMO_EMAIL },
    select: { id: true },
  });

  if (existing !== null) {
    console.log(`Demo user already present: ${DEMO_EMAIL}`);
    return;
  }

  // Going through the real registration path means the seed exercises the same
  // hashing and starter-category creation the API uses.
  const { user } = await registerUser({
    name: "Demo",
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });

  console.log(`Seeded ${user.email} (password: ${DEMO_PASSWORD})`);
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
