import { getAuth } from "@/server/better-auth";

const handler = (request: Request) => getAuth().handler(request);

export { handler as GET, handler as POST };
