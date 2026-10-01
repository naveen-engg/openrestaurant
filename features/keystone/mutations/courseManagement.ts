import type { Context } from ".keystone/types";
import { permissions } from "../access";
import { appendKitchenTicketEvent } from "../utils/kitchenTicketEvents";
import { syncKitchenTicketsForOrder } from "../utils/kitchenTicketSync";

interface FireCourseArgs {
  courseId: string;
}

interface RecallCourseArgs {
  courseId: string;
}

interface ItemCourseArgs {
  orderItemId: string;
}

interface CourseManagementResult {
  success: boolean;
  error: string | null;
}

export async function fireCourse(
  root: any,
  args: FireCourseArgs,
  context: Context
): Promise<CourseManagementResult> {
  if (!permissions.canManageKitchen({ session: context.session })) {
    return { success: false, error: "Not authorized" };
  }

  const { courseId } = args;
  const sudo = context.sudo();

  try {
    const nowIso = new Date().toISOString();
    await sudo.db.OrderCourse.updateOne({
      where: { id: courseId },
      data: {
        status: 'fired',
        onHold: false,
        fireTime: nowIso,
      }
    });

    const course = await sudo.query.OrderCourse.findOne({
      where: { id: courseId },
      query: 'order { id } orderItems { id }'
    });

    if (course?.orderItems?.length) {
      await Promise.all(
        course.orderItems.map((item: any) =>
          sudo.db.OrderItem.updateOne({
            where: { id: item.id },
            data: {
              sentToKitchen: nowIso,
              firedAt: nowIso,
              kitchenStatus: 'new',
            }
          })
        )
      );
    }

    if (course?.order?.id) {
      await syncKitchenTicketsForOrder(course.order.id, context as any);
    }

    await appendKitchenTicketEvent(context, {
      eventType: 'dispatch',
      orderId: course?.order?.id,
      payload: { courseId, action: 'fire', orderItemIds: (course?.orderItems || []).map((item: any) => item.id) },
    });

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function recallCourse(
  root: any,
  args: RecallCourseArgs,
  context: Context
): Promise<CourseManagementResult> {
  if (!permissions.canManageKitchen({ session: context.session })) {
    return { success: false, error: "Not authorized" };
  }

  const { courseId } = args;
  const sudo = context.sudo();

  try {
    await sudo.db.OrderCourse.updateOne({
      where: { id: courseId },
      data: {
        status: 'pending',
        onHold: true,
        fireTime: null,
      }
    });

    const course = await sudo.query.OrderCourse.findOne({
      where: { id: courseId },
      query: 'order { id } orderItems { id }',
    });

    const recalledAt = new Date().toISOString();
    await Promise.all((course?.orderItems || []).map((item: any) =>
      sudo.db.OrderItem.updateOne({
        where: { id: item.id },
        data: { kitchenStatus: 'held', firedAt: null, recalledAt },
      })
    ));

    if (course?.order?.id) {
      await syncKitchenTicketsForOrder(course.order.id, context as any);
    }

    await appendKitchenTicketEvent(context, {
      eventType: 'recall',
      orderId: course?.order?.id,
      payload: { courseId, action: 'recall', orderItemIds: (course?.orderItems || []).map((item: any) => item.id) },
    });

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export const holdCourse = recallCourse;

export async function fireOrderItem(
  root: any,
  args: ItemCourseArgs,
  context: Context
): Promise<CourseManagementResult> {
  if (!permissions.canManageKitchen({ session: context.session })) {
    return { success: false, error: "Not authorized" };
  }
  const { orderItemId } = args;
  const sudo = context.sudo();
  try {
    const nowIso = new Date().toISOString();
    await sudo.db.OrderItem.updateOne({
      where: { id: orderItemId },
      data: {
        sentToKitchen: nowIso,
        firedAt: nowIso,
        kitchenStatus: 'new',
      },
    });

    const item = await sudo.query.OrderItem.findOne({
      where: { id: orderItemId },
      query: 'id order { id }',
    });

    if (item?.order?.id) {
      await syncKitchenTicketsForOrder(item.order.id, context as any);
    }

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function holdOrderItem(
  root: any,
  args: ItemCourseArgs,
  context: Context
): Promise<CourseManagementResult> {
  if (!permissions.canManageKitchen({ session: context.session })) {
    return { success: false, error: "Not authorized" };
  }
  const { orderItemId } = args;
  const sudo = context.sudo();
  try {
    await sudo.db.OrderItem.updateOne({
      where: { id: orderItemId },
      data: {
        kitchenStatus: 'held',
        firedAt: null,
      },
    });

    const item = await sudo.query.OrderItem.findOne({
      where: { id: orderItemId },
      query: 'id order { id }',
    });

    if (item?.order?.id) {
      await syncKitchenTicketsForOrder(item.order.id, context as any);
    }

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

