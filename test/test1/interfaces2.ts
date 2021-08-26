export interface SearchAttributes extends SAB {
  referenceId?: string
  referenceType?: string
  ext?: any
}
interface SAA {
  id: string
  category: string
  content: string
  name: string
}
interface SAB extends SAA {
  createdAt: Date
  updatedAt: Date
  userId: string
  organizationId?: string
  workspaceId?: string
}

export interface Location {
  /**
   * Country
   */
  country: string
  city: string
  region: {
    a: string
    /**
     * b prop
     */
    b: string
  }
}
