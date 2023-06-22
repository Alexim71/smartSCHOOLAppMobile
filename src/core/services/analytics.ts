// (C) Copyright 2015 Moodle Pty Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { Injectable } from '@angular/core';
import { CoreDelegate, CoreDelegateHandler } from '@classes/delegate';
import { CorePushNotificationsNotificationBasicData } from '@features/pushnotifications/services/pushnotifications';
import { makeSingleton } from '@singletons';
import { CoreEvents } from '@singletons/events';
import { CoreSites } from './sites';
import { CoreConfig, CoreConfigProvider } from './config';
import { CoreConstants } from '../constants';
import { CoreUrlUtils } from './utils/url';

/**
 * Helper service to support analytics.
 */
@Injectable({ providedIn: 'root' })
export class CoreAnalyticsService extends CoreDelegate<CoreAnalyticsHandler> {

    constructor() {
        super('CoreAnalyticsService', true);

        CoreEvents.on(CoreConfigProvider.ENVIRONMENT_UPDATED, () => this.updateHandlers());
        CoreEvents.on(CoreEvents.LOGOUT, () => this.clearSiteHandlers());
    }

    /**
     * Clear current site handlers. Reserved for core use.
     */
    protected clearSiteHandlers(): void {
        this.enabledHandlers = {};
    }

    /**
     * Enable or disable analytics for all handlers.
     *
     * @param enable Whether to enable or disable.
     * @returns Promise resolved when done.
     */
    async enableAnalytics(enable: boolean): Promise<void> {
        try {
            await Promise.all(Object.values(this.handlers).map(handler => handler.enableAnalytics?.(enable)));
        } catch (error) {
            this.logger.error(`Error ${enable ? 'enabling' : 'disabling'} analytics`, error);
        }
    }

    /**
     * Log an event for the current site.
     *
     * @param event Event data.
     */
    async logEvent(event: CoreAnalyticsViewEvent | CoreAnalyticsPushEvent): Promise<void> {
        const site = CoreSites.getCurrentSite();
        if (!site) {
            return;
        }

        // Check if analytics is enabled by the user.
        const enabled = await CoreConfig.get<boolean>(CoreConstants.SETTINGS_ANALYTICS_ENABLED, true);
        if (!enabled) {
            return;
        }

        const treatedEvent: CoreAnalyticsEvent = {
            ...event,
            siteId: site.getId(),
        };
        if ('url' in treatedEvent && treatedEvent.url) {
            if (!CoreUrlUtils.isAbsoluteURL(treatedEvent.url)) {
                treatedEvent.url = site.createSiteUrl(treatedEvent.url);
            } else if (!site.containsUrl(treatedEvent.url)) {
                // URL belongs to a different site, ignore the event.
                return;
            }
        }

        try {
            await Promise.all(Object.values(this.enabledHandlers).map(handler => handler.logEvent(treatedEvent)));
        } catch (error) {
            this.logger.error('Error logging event', event, error);
        }
    }

}

export const CoreAnalytics = makeSingleton(CoreAnalyticsService);

/**
 * Interface that all analytics handlers must implement.
 */
export interface CoreAnalyticsHandler extends CoreDelegateHandler {

    /**
     * Log an event.
     *
     * @param event Event data.
     */
    logEvent(event: CoreAnalyticsEvent): Promise<void>;

    /**
     * Enable or disable analytics.
     *
     * @param enable Whether to enable or disable.
     * @returns Promise resolved when done.
     */
    enableAnalytics?(enable: boolean): Promise<void>;

}

/**
 * Possible types of events.
 */
export enum CoreAnalyticsEventType {
    VIEW_ITEM = 'view_item', // View some page or data that mainly contains one item.
    VIEW_ITEM_LIST = 'view_item_list', // View some page or data that mainly contains a list of items.
    PUSH_NOTIFICATION = 'push_notification', // Event related to push notifications.
}

/**
 * Event data, including calculated data.
 */
export type CoreAnalyticsEvent = (CoreAnalyticsViewEvent | CoreAnalyticsPushEvent) & {
    siteId: string;
};

/**
 * Data specific for the VIEW_ITEM and VIEW_LIST events.
 */
export type CoreAnalyticsViewEvent = {
    type: CoreAnalyticsEventType.VIEW_ITEM | CoreAnalyticsEventType.VIEW_ITEM_LIST;
    ws: string; // Name of the WS used to log the data in LMS or to obtain the data if there is no log WS.
    name: string; // Name of the item or page viewed.
    url?: string; // Moodle URL. You can use the URL without the domain, e.g. /mod/foo/view.php.
    data?: {
        id?: number | string; // ID of the item viewed (if any).
        category?: string; // Category of the data viewed (if any).
        [key: string]: string | number | boolean | undefined;
    };
};

/**
 * Data specific for the PUSH_NOTIFICATION events.
 */
export type CoreAnalyticsPushEvent = {
    type: CoreAnalyticsEventType.PUSH_NOTIFICATION;
    eventName: string; // Name of the event.
    data: CorePushNotificationsNotificationBasicData;
};
