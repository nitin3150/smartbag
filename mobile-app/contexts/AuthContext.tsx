import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import Constants from 'expo-constants';
import {
  API_BASE_URL,
  API_ENDPOINTS,
  createApiUrl,
  API_REQUEST_TIMEOUT,
} from '../config/apiConfig';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { secureStorage } from '../utils/secureStorage';
import { InputValidator } from '../utils/validation';

// Type definitions
interface User {
  _id: string;
  id?: string;
  name: string;
  email: string;
  phone?: string;
  role: 'customer' | 'delivery_partner' | 'admin' | 'user';
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  googleId?: string;
  profilePicture?: string;
  provider?: string;
  is_active?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  apiUrl: string;
  login: (email: string, password: string) => Promise<LoginResult>;
  googleLogin: (googleToken: string, userInfo: any) => Promise<LoginResult>;
  register: (userData: RegisterData) => Promise<RegisterResult>;
  updatePhone: (phone: string) => Promise<UpdatePhoneResult>;
  sendVerificationCode: (phone: string) => Promise<VerificationResult>;
  verifyPhone: (phone: string, code: string) => Promise<VerificationResult>;
  logout: () => Promise<void>;
  updateProfile: (updatedData: UpdateProfileData) => Promise<UpdateProfileResult>;
  refreshToken: () => Promise<boolean>;
}

interface LoginResult {
  success: boolean;
  error?: string;
  requires_phone?: boolean;
}

interface RegisterData {
  name: string;
  email: string;
  phone?: string;
  password: string;
  confirmPassword?: string;
}

interface RegisterResult {
  success: boolean;
  error?: string;
  message?: string;
  requires_phone?: boolean;
}

interface UpdatePhoneResult {
  success: boolean;
  error?: string;
  user?: User;
}

interface VerificationResult {
  success: boolean;
  error?: string;
}

interface UpdateProfileData {
  name?: string;
}

interface UpdateProfileResult {
  success: boolean;
  error?: string;
  user?: User;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshTokenValue, setRefreshTokenValue] = useState<string | null>(null);

  // Get Google OAuth config from environment
  const getGoogleConfig = useCallback(() => {
    const extra = Constants.expoConfig?.extra;
    return {
      webClientId: extra?.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '',
      iosClientId: extra?.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '',
    };
  }, []);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  useEffect(() => {
    // Setup token refresh interval
    let refreshInterval: NodeJS.Timeout;
    
    if (token && refreshTokenValue) {
      // Refresh token every 14 minutes (tokens usually expire in 15 minutes)
      refreshInterval = setInterval(() => {
        handleTokenRefresh();
      }, 14 * 60 * 1000);
    }
    
    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [token, refreshTokenValue]);

  const clearAuth = async (): Promise<void> => {
    setToken(null);
    setUser(null);
    setRefreshTokenValue(null);
    await secureStorage.clearAuthData();
  };

  const validateToken = async (tokenToValidate: string): Promise<boolean> => {
    try {
      const response = await fetchWithTimeout(
        API_ENDPOINTS.PROFILE,
        {
          headers: {
            'Authorization': `Bearer ${tokenToValidate}`,
          },
        },
        5000
      );
      
      if (!response.ok) {
        // Try to refresh token
        if (refreshTokenValue) {
          return await handleTokenRefresh();
        }
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Token validation error:', error);
      return false;
    }
  };

  const loadStoredAuth = async (): Promise<void> => {
    try {
      console.log('=== Loading stored auth from secure storage ===');
      
      const authData = await secureStorage.getAuthData();
      console.log('Auth data found:', {
        hasToken: !!authData.accessToken,
        hasRefreshToken: !!authData.refreshToken,
        hasUserData: !!authData.userData,
      });
      
      if (authData.accessToken && authData.userData) {
        console.log('Setting user from storage:', authData.userData.email);
        
        setToken(authData.accessToken);
        setUser(authData.userData);
        setRefreshTokenValue(authData.refreshToken);
        
        // CRITICAL: Don't validate token immediately on app start for Google users
        // This causes auto-logout issues
        // Instead, let the token validation happen naturally when making API calls
        
        console.log('Auth loaded successfully');
      } else {
        console.log('No complete auth data found in storage');
      }
    } catch (error) {
      console.error('Error loading stored auth:', error);
      // Don't clear auth on load error - might be temporary
      console.log('Keeping existing auth state despite load error');
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<LoginResult> => {
    try {
      console.log('Attempting login for:', email);
      
      // Input validation
      const emailValidation = InputValidator.validateEmail(email);
      if (!emailValidation.isValid) {
        return { success: false, error: emailValidation.error };
      }

      if (!password) {
        return { success: false, error: 'Password is required' };
      }

      const response = await fetchWithTimeout(
        createApiUrl('auth/login'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            email: emailValidation.sanitizedValue, 
            password 
          }),
        },
        API_REQUEST_TIMEOUT
      );

      const data = await response.json();
      console.log('Login response received');

      if (!response.ok) {
        const errorMessage = data.detail || data.message || 'Login failed';
        return { success: false, error: errorMessage };
      }

      // Store authentication data securely
      await secureStorage.storeAuthData(
        data.access_token,
        data.refresh_token,
        data.user
      );

      setToken(data.access_token);
      setRefreshTokenValue(data.refresh_token);
      setUser(data.user);
      
      return { 
        success: true,
        requires_phone: data.requires_phone || false
      };
    } catch (error) {
      console.error('Login error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Network error. Please try again.';
      return { success: false, error: errorMessage };
    }
  };

  const register = async (userData: RegisterData): Promise<RegisterResult> => {
    try {
      console.log('Attempting registration for:', userData.email);
      
      // Input validation
      const nameValidation = InputValidator.validateName(userData.name);
      if (!nameValidation.isValid) {
        return { success: false, error: nameValidation.error };
      }

      const emailValidation = InputValidator.validateEmail(userData.email);
      if (!emailValidation.isValid) {
        return { success: false, error: emailValidation.error };
      }

      const passwordValidation = InputValidator.validatePassword(userData.password);
      if (!passwordValidation.isValid) {
        return { success: false, error: passwordValidation.error };
      }

      const response = await fetchWithTimeout(
        createApiUrl('auth/register'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: nameValidation.sanitizedValue,
            email: emailValidation.sanitizedValue,
            password: passwordValidation.sanitizedValue,
          }),
        },
        API_REQUEST_TIMEOUT
      );

      const data = await response.json();
      console.log('Registration response received');

      if (!response.ok) {
        const errorMessage = data.detail || data.message || 'Registration failed';
        return { success: false, error: errorMessage };
      }

      // Store authentication data if registration includes login
      if (data.access_token) {
        await secureStorage.storeAuthData(
          data.access_token,
          data.refresh_token,
          data.user
        );

        setToken(data.access_token);
        setRefreshTokenValue(data.refresh_token);
        setUser(data.user);
      }

      return { 
        success: true, 
        message: data.message || 'Registration successful',
        requires_phone: data.requires_phone !== false
      };
    } catch (error) {
      console.error('Registration error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Network error. Please try again.';
      return { success: false, error: errorMessage };
    }
  };

  // const googleLogin = async (googleToken: string, userInfo: any): Promise<LoginResult> => {
  //   try {
  //     console.log('Attempting Google login');
      
  //     const googleConfig = getGoogleConfig();
      
  //     const response = await fetchWithTimeout(
  //       createApiUrl('auth/google'),
  //       {
  //         method: 'POST',
  //         headers: {
  //           'Content-Type': 'application/json',
  //         },
  //         body: JSON.stringify({
  //           googleToken,
  //           user: {
  //             googleId: userInfo.googleId,
  //             email: userInfo.email?.toLowerCase(),
  //             name: userInfo.name,
  //           },
  //           clientId: googleConfig.webClientId,
  //         }),
  //       },
  //       API_REQUEST_TIMEOUT
  //     );

  //     const data = await response.json();
      
  //     if (!response.ok) {
  //       const errorMessage = data.message || 'Google login failed';
  //       return { success: false, error: errorMessage };
  //     }

  //     // Store authentication data securely
  //     await secureStorage.storeAuthData(
  //       data.access_token,
  //       data.refresh_token,
  //       data.user
  //     );

  //     setToken(data.access_token);
  //     setRefreshTokenValue(data.refresh_token);
  //     setUser(data.user);

  //     return { 
  //       success: true,
  //       requires_phone: data.requires_phone || false
  //     };
  //   } catch (error) {
  //     console.error('Google login error:', error);
  //     const errorMessage = error instanceof Error ? error.message : 'Google login failed';
  //     return { success: false, error: errorMessage };
  //   }
  // };

  const googleLogin = async (googleToken: string, userInfo: any): Promise<LoginResult> => {
    try {
      console.log('=== Starting Google login ===');
      console.log('User info:', userInfo.email);
      
      const response = await fetchWithTimeout(
        createApiUrl('auth/google'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            googleToken,
            user: {
              googleId: userInfo.googleId,
              email: userInfo.email?.toLowerCase(),
              name: userInfo.name,
            },
          }),
        },
        API_REQUEST_TIMEOUT
      );
  
      const data = await response.json();
      console.log('Google login response received');
      
      if (!response.ok) {
        const errorMessage = data.message || 'Google login failed';
        return { success: false, error: errorMessage };
      }
  
      // CRITICAL: Verify we have tokens before proceeding
      if (!data.access_token || !data.user) {
        console.error('Google login response missing required data:', data);
        return { success: false, error: 'Invalid server response' };
      }
  
      console.log('Storing auth data securely...');
      
      // Store authentication data securely
      try {
        await secureStorage.storeAuthData(
          data.access_token,
          data.refresh_token,
          data.user
        );
        console.log('Auth data stored successfully in secure storage');
      } catch (storageError) {
        console.error('CRITICAL: Failed to store auth data:', storageError);
        // Continue anyway - at least set in memory
      }
  
      setToken(data.access_token);
      setRefreshTokenValue(data.refresh_token);
      setUser(data.user);
      
      console.log('Google login complete, user state set');
  
      return { 
        success: true,
        requires_phone: data.requires_phone || false
      };
    } catch (error) {
      console.error('Google login error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Google login failed';
      return { success: false, error: errorMessage };
    }
  };

  const updatePhone = async (phone: string): Promise<UpdatePhoneResult> => {
    try {
      console.log('Updating phone number');
      
      if (!token) {
        return { success: false, error: 'Not authenticated. Please login again.' };
      }

      // Phone validation
      const phoneValidation = InputValidator.validatePhone(phone);
      if (!phoneValidation.isValid) {
        return { success: false, error: phoneValidation.error };
      }
      
      const response = await fetchWithTimeout(
        createApiUrl('auth/phone'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ phone: phoneValidation.sanitizedValue }),
        },
        API_REQUEST_TIMEOUT
      );

      const data = await response.json();
      console.log('Phone update response received');

      if (!response.ok) {
        if (response.status === 401) {
          await clearAuth();
          return { success: false, error: 'Session expired. Please login again.' };
        }
        const errorMessage = data.detail || data.message || 'Failed to update phone number';
        return { success: false, error: errorMessage };
      }

      // Update user data
      const updatedUser = data.user || { ...user, phone: phoneValidation.sanitizedValue };
      setUser(updatedUser);
      
      // Update stored user data
      await secureStorage.storeAuthData(token, refreshTokenValue, updatedUser);
      
      return { success: true, user: updatedUser };
    } catch (error) {
      console.error('Phone update error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Network error. Please try again.';
      return { success: false, error: errorMessage };
    }
  };

  const sendVerificationCode = async (phone: string): Promise<VerificationResult> => {
    try {
      console.log('Sending verification code');
      
      const phoneValidation = InputValidator.validatePhone(phone);
      if (!phoneValidation.isValid) {
        return { success: false, error: phoneValidation.error };
      }
      
      const response = await fetchWithTimeout(
        createApiUrl('auth/send-verification'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : '',
          },
          body: JSON.stringify({ phone: phoneValidation.sanitizedValue }),
        },
        API_REQUEST_TIMEOUT
      );

      const data = await response.json();
      
      if (!response.ok) {
        const errorMessage = data.detail || data.message || 'Failed to send verification code';
        return { success: false, error: errorMessage };
      }

      return { success: true };
    } catch (error) {
      console.error('Send verification code error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Network error. Please try again.';
      return { success: false, error: errorMessage };
    }
  };

  const verifyPhone = async (phone: string, code: string): Promise<VerificationResult> => {
    try {
      console.log('Verifying phone number');
      
      const phoneValidation = InputValidator.validatePhone(phone);
      if (!phoneValidation.isValid) {
        return { success: false, error: phoneValidation.error };
      }

      if (!code || code.length !== 6) {
        return { success: false, error: 'Please enter a valid 6-digit code' };
      }
      
      const response = await fetchWithTimeout(
        createApiUrl('auth/verify-phone'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : '',
          },
          body: JSON.stringify({ 
            phone: phoneValidation.sanitizedValue, 
            code: code.trim() 
          }),
        },
        API_REQUEST_TIMEOUT
      );

      const data = await response.json();
      
      if (!response.ok) {
        const errorMessage = data.detail || data.message || 'Invalid verification code';
        return { success: false, error: errorMessage };
      }

      // Update user data with verified phone
      if (data.user) {
        setUser(data.user);
        await secureStorage.storeAuthData(token, refreshTokenValue, data.user);
      }

      return { success: true };
    } catch (error) {
      console.error('Verify phone error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Network error. Please try again.';
      return { success: false, error: errorMessage };
    }
  };

  const logout = async (): Promise<void> => {
    try {
      console.log('Logging out...');
      
      // Call logout endpoint if token exists
      if (token) {
        try {
          await fetchWithTimeout(
            createApiUrl('auth/logout'),
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
              },
            },
            5000
          );
        } catch (error) {
          console.warn('Logout endpoint error (ignoring):', error);
        }
      }
      
      await clearAuth();
      console.log('Logout completed');
    } catch (error) {
      console.error('Error during logout:', error);
      await clearAuth();
    }
  };

  const updateProfile = async (updatedData: UpdateProfileData): Promise<UpdateProfileResult> => {
    try {
      if (!token) {
        return { success: false, error: 'Not authenticated. Please login again.' };
      }

      // Validate name if provided
      if (updatedData.name) {
        const nameValidation = InputValidator.validateName(updatedData.name);
        if (!nameValidation.isValid) {
          return { success: false, error: nameValidation.error };
        }
        updatedData.name = nameValidation.sanitizedValue;
      }

      const response = await fetchWithTimeout(
        API_ENDPOINTS.PROFILE,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(updatedData),
        },
        API_REQUEST_TIMEOUT
      );

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          await clearAuth();
          return { success: false, error: 'Session expired. Please login again.' };
        }
        const errorMessage = data.detail || data.message || 'Profile update failed';
        return { success: false, error: errorMessage };
      }

      setUser(data.user);
      await secureStorage.storeAuthData(token, refreshTokenValue, data.user);

      return { success: true, user: data.user };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Profile update failed';
      return { success: false, error: errorMessage };
    }
  };

  // const handleTokenRefresh = async (): Promise<boolean> => {
  //   try {
  //     if (!refreshTokenValue) {
  //       console.log('No refresh token available');
  //       await clearAuth();
  //       return false;
  //     }

  //     console.log('Attempting to refresh token...');
  //     const response = await fetchWithTimeout(
  //       API_ENDPOINTS.REFRESH_TOKEN,
  //       {
  //         method: 'POST',
  //         headers: {
  //           'Content-Type': 'application/json',
  //         },
  //         body: JSON.stringify({ refresh_token: refreshTokenValue }),
  //       },
  //       10000
  //     );

  //     if (!response.ok) {
  //       console.log('Token refresh failed, clearing auth');
  //       await clearAuth();
  //       return false;
  //     }

  //     const data = await response.json();
      
  //     // Update tokens
  //     setToken(data.access_token);
  //     if (data.refresh_token) {
  //       setRefreshTokenValue(data.refresh_token);
  //     }

  //     // Save new tokens securely
  //     await secureStorage.storeAuthData(
  //       data.access_token,
  //       data.refresh_token || refreshTokenValue,
  //       user
  //     );

  //     console.log('Token refreshed successfully');
  //     return true;
  //   } catch (error) {
  //     console.error('Token refresh error:', error);
  //     await clearAuth();
  //     return false;
  //   }
  // };


  const handleTokenRefresh = async (): Promise<boolean> => {
    try {
      if (!refreshTokenValue) {
        console.log('No refresh token available');
        // Don't auto-logout here - might just be missing refresh token
        return false;
      }
  
      console.log('Attempting to refresh access token...');
      
      const response = await fetchWithTimeout(
        API_ENDPOINTS.REFRESH_TOKEN,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refresh_token: refreshTokenValue }),
        },
        10000
      );
  
      if (!response.ok) {
        console.log('Token refresh failed, status:', response.status);
        const errorData = await response.json().catch(() => ({}));
        console.log('Refresh error:', errorData);
        
        // Only clear auth if it's definitely invalid (401/403)
        if (response.status === 401 || response.status === 403) {
          console.log('Refresh token invalid, clearing auth');
          await clearAuth();
          return false;
        }
        
        // For other errors, keep current token and try again later
        return false;
      }
  
      const data = await response.json();
      console.log('Token refreshed successfully');
      
      // Update tokens
      setToken(data.access_token);
      if (data.refresh_token) {
        setRefreshTokenValue(data.refresh_token);
      }
  
      // Save new tokens securely
      await secureStorage.storeAuthData(
        data.access_token,
        data.refresh_token || refreshTokenValue,
        user
      );
  
      console.log('New tokens stored successfully');
      return true;
    } catch (error) {
      console.error('Token refresh error:', error);
      // Don't auto-logout on network errors
      return false;
    }
  };
  
  const value: AuthContextType = {
    user,
    token,
    loading,
    apiUrl: API_BASE_URL,
    login,
    googleLogin,
    register,
    updatePhone,
    sendVerificationCode,
    verifyPhone,
    logout,
    updateProfile,
    refreshToken: handleTokenRefresh,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};