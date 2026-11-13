import { IsEnum } from 'class-validator';
import { SubscriptionPlan } from '../../../generated/prisma';

export class UpdateSubscriptionDto {
  @IsEnum(SubscriptionPlan)
  plan!: SubscriptionPlan;
}
