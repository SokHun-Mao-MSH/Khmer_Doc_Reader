export interface Folder {
  id: string;
  name: string;
  ownerId: string;
  order: number;
}

export interface Lesson {
  id: string;
  folderId: string;
  title: string;
  content: string;
  order: number;
  ownerId: string;
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: {
    userId: string;
    email: string;
    emailVerified: boolean;
    isAnonymous: boolean;
    providerInfo: { providerId: string; displayName: string; email: string; }[];
  }
}
