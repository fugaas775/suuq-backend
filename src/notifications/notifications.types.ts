export type FirebaseMessagingResponse = {
  successCount: number;
  failureCount: number;
  responses?: Array<{
    success: boolean;
    error?: { code?: string; message?: string };
  }>;
};

export type FirebaseMessagingClient = {
  sendEachForMulticast: (message: {
    notification: { title: string; body: string };
    tokens: string[];
  }) => Promise<FirebaseMessagingResponse>;
};

export type FirebaseAdmin = {
  messaging?: () => FirebaseMessagingClient;
};
