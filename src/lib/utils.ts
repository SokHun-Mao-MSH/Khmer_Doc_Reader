import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function handleFirestoreError(error: any, operationType: any, path: string | null = null): never {
  const auth = (window as any).firebaseAuth; // Assuming auth is exposed or we need to pass it
  const user = auth?.currentUser;
  
  const errorInfo: any = {
    error: error.message || 'Unknown error',
    operationType,
    path,
    authInfo: user ? {
      userId: user.uid,
      email: user.email || '',
      emailVerified: user.emailVerified,
      isAnonymous: user.isAnonymous,
      providerInfo: user.providerData.map((p: any) => ({
        providerId: p.providerId,
        displayName: p.displayName || '',
        email: p.email || '',
      }))
    } : null
  };
  
  throw JSON.stringify(errorInfo);
}
