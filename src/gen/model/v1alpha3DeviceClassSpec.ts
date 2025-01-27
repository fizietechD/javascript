/**
 * Kubernetes
 * No description provided (generated by Openapi Generator https://github.com/openapitools/openapi-generator)
 *
 * The version of the OpenAPI document: release-1.31
 * 
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 */

import { RequestFile } from './models';
import { V1NodeSelector } from './v1NodeSelector';
import { V1alpha3DeviceClassConfiguration } from './v1alpha3DeviceClassConfiguration';
import { V1alpha3DeviceSelector } from './v1alpha3DeviceSelector';

/**
* DeviceClassSpec is used in a [DeviceClass] to define what can be allocated and how to configure it.
*/
export class V1alpha3DeviceClassSpec {
    /**
    * Config defines configuration parameters that apply to each device that is claimed via this class. Some classses may potentially be satisfied by multiple drivers, so each instance of a vendor configuration applies to exactly one driver.  They are passed to the driver, but are not considered while allocating the claim.
    */
    'config'?: Array<V1alpha3DeviceClassConfiguration>;
    /**
    * Each selector must be satisfied by a device which is claimed via this class.
    */
    'selectors'?: Array<V1alpha3DeviceSelector>;
    'suitableNodes'?: V1NodeSelector;

    static discriminator: string | undefined = undefined;

    static attributeTypeMap: Array<{name: string, baseName: string, type: string}> = [
        {
            "name": "config",
            "baseName": "config",
            "type": "Array<V1alpha3DeviceClassConfiguration>"
        },
        {
            "name": "selectors",
            "baseName": "selectors",
            "type": "Array<V1alpha3DeviceSelector>"
        },
        {
            "name": "suitableNodes",
            "baseName": "suitableNodes",
            "type": "V1NodeSelector"
        }    ];

    static getAttributeTypeMap() {
        return V1alpha3DeviceClassSpec.attributeTypeMap;
    }
}

