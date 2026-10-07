"use server";

import { cookies } from "next/headers"

export const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const cookieStore = await cookies()
  const token = cookieStore.get("keystonejs-session")?.value
  const cartId = cookieStore.get("_restaurant_cart_id")?.value
  const headers: Record<string, string> = {}

  if (token) {
    headers.authorization = `Bearer ${token}`
  }

  if (cartId) {
    headers.cookie = `_restaurant_cart_id=${cartId}`
  }

  return headers
}

type CookieOptions = { [key: string]: any; };

export const setAuthToken = async (token: string, options: CookieOptions = {}) => {
  (await cookies()).set("keystonejs-session", token, {
    maxAge: 60 * 60 * 24 * 30,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    ...options
  })
}

export const removeAuthToken = async () => {
  (await cookies()).set("keystonejs-session", "", {
    maxAge: -1,
  })
}

export const getCartId = async (): Promise<string | undefined> => {
  return (await cookies()).get("_restaurant_cart_id")?.value
}

export const setCartId = async (cartId: string, options: CookieOptions = {}) => {
  (await cookies()).set("_restaurant_cart_id", cartId, {
    maxAge: 60 * 60 * 24 * 7,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    ...options
  })
}

export const removeCartId = async () => {
  (await cookies()).set("_restaurant_cart_id", "", { maxAge: -1 })
}
