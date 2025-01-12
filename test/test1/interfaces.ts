import { Location, SearchAttributes } from './interfaces2'

export interface Employer {
  /**
   * The job title string
   */
  jobTitle?: string
  /**
   * The IPerson Interface
   */
  person?: Person
  /**
   * An array of ISkill interfaces
   */
  skills: Skill[]
}

export interface Person {
  /**
   * The name of the person
   */
  name: string
  /**
   * The age of the person
   */
  age: number
  dateOfBirth: Date
  /**
   * The Address Object
   */
  address: {
    /**
     * Address line 1
     */
    address_line_1: string
    /**
     * Postcode
     */
    postcode?: number
    /**
     * Location
     */
    location: Location
  }
}

export interface Skill {
  description: string // description
  level: number
}

export interface Shape {

  color: string

  radius: number
}

export interface Square extends Shape {

  sideLength: number
}

export interface InnerSquare extends Square {

  bottomLength: number
}

export interface ShapedSkill extends Skill, Shape { }

export interface TeamPicks {
  id: number
  picks: TeamPick[]
}

export interface TeamPick {
  id: number
  webName: string
  stats: TeamPickStats
}
export interface TeamPickStats extends PlayerStats {
  timesBenched: number
  timesCaptained: number
}

export interface PlayerStats {
  totalGoals: number
}

export interface SearchResult {
  data: SearchAttributes
  highlight: any
  org: {
    id: string
    fullname: string
  }
  workspace: {
    id: string
    fullname: string
  }
  parentMission: {
    id: string
    title: string
  }
  ref: {
    id: string
    title: string
  }
  room: {
    _id: string
    id: string
    name: string
  }
  user: {
    id: string
    nickname: string
    avatar: string
  }
}

export namespace CustomNamespace {
  interface InternalInterface {
    internal_id: string
  }

  export interface PublicInterface extends InternalInterface {
    public_id: string
  }

  export interface ComposedInterface extends PublicInterface {
    name: string
  }
}

export interface GenericInterface<T> {
  name: string
  value: T
}
