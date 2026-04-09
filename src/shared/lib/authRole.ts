import type { UserRole } from '../api/backendApi'

export function getRoleLabel(role: UserRole): string {
  switch (role) {
    case 'admin':
      return 'Администратор'
    case 'user':
      return 'Пользователь'
    default:
      return 'Ограниченный доступ'
  }
}

